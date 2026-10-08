import "server-only";

import { createHash, randomBytes } from "node:crypto";

import db from "@/db";
import type { Actor, CompanyRole } from "@/lib/auth";
import { addDays, workingDayEnd } from "@/lib/dates";
import { listEventOccurrences } from "@/lib/events-calendar";
import { queueGoogleConnection } from "@/lib/google-calendar-queue";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "@/lib/integration-crypto";
import { platformGoogleConfig } from "@/lib/integration-setup";
import {
  exchangeGoogleAuthorization,
  integrationProviderIsFake,
  IntegrationProviderError,
  refreshGoogleAccessToken,
  requireGoogleScope,
} from "@/lib/integration-providers";
import { sha256 } from "@/lib/security";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const MANAGED_DESCRIPTION = "Managed by Dialoggg. Google edits will not be saved. Make schedule changes in Dialoggg.";

type ConnectionRow = {
  id: number;
  identity_id: number;
  company_id: number;
  membership_id: number;
  token_ciphertext: string;
  token_key_version: number;
  calendar_id_ciphertext: string | null;
  granted_scope: string;
  state: "connection_required" | "connecting" | "healthy" | "paused" | "action_required" | "disconnected";
  pause_reason: string | null;
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_error_code: string | null;
  last_reconciled_at: string | null;
  retry_after: string | null;
  created_at: string;
  updated_at: string;
};

type DeliveryItem = {
  sourceType: "task" | "event";
  sourceId: string;
  occurrenceKey: string;
  sourceVersion: number;
  payload: Record<string, unknown>;
};

type GoogleFailureKind = "authorization" | "permission" | "transient" | "permanent";

export class GoogleCalendarError extends Error {
  constructor(public readonly code: string, public readonly kind: GoogleFailureKind, public readonly status = 400) {
    super(code);
  }
}

function connectionFor(identityId: number, companyId: number) {
  return db.prepare("SELECT * FROM google_connection WHERE identity_id = ? AND company_id = ?")
    .get(identityId, companyId) as ConnectionRow | undefined;
}

function connectionById(id: number) {
  return db.prepare("SELECT * FROM google_connection WHERE id = ?").get(id) as ConnectionRow | undefined;
}

function requireCompanyActor(actor: Actor) {
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !actor.companyRole) {
    throw new GoogleCalendarError("COMPANY_CONTEXT_REQUIRED", "permanent", 403);
  }
}

function tokenContext(connectionId: number, version: number) {
  return `google-connection:${connectionId}:token:v${version}`;
}

function calendarContext(connectionId: number, version: number) {
  return `google-connection:${connectionId}:calendar:v${version}`;
}

function parseToken(connection: ConnectionRow) {
  return decryptIntegrationSecret(connection.token_ciphertext, tokenContext(connection.id, connection.token_key_version)).refreshToken;
}

function parseCalendarId(connection: ConnectionRow) {
  if (!connection.calendar_id_ciphertext) return null;
  return decryptIntegrationSecret(connection.calendar_id_ciphertext, calendarContext(connection.id, connection.token_key_version)).calendarId || null;
}

export function createGoogleOauthState(actor: Actor) {
  requireCompanyActor(actor);
  const platform = platformGoogleConfig(true);
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const context = `google-oauth:${actor.sessionId}:${actor.identityId}:${actor.companyId}`;
  const encrypted = encryptIntegrationSecret({ verifier }, context);
  db.prepare(`
    INSERT INTO google_oauth_state (
      auth_session_id, identity_id, company_id, membership_id, state_hash, encrypted_context, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+10 minutes'))
  `).run(actor.sessionId, actor.identityId, actor.companyId, actor.membershipId, sha256(state), encrypted);
  const existing = connectionFor(actor.identityId, actor.companyId!);
  if (existing) db.prepare("UPDATE google_connection SET state = 'connecting', last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(existing.id);
  return { state, challenge, config: platform.config };
}

export function consumeGoogleOauthState(rawState: string, actor: Actor | null) {
  if (!actor || actor.contextType !== "company" || !actor.companyId || !actor.membershipId) return null;
  const row = db.prepare(`
    SELECT id, encrypted_context FROM google_oauth_state
    WHERE state_hash = ? AND auth_session_id = ? AND identity_id = ? AND company_id = ? AND membership_id = ?
      AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
  `).get(sha256(rawState), actor.sessionId, actor.identityId, actor.companyId, actor.membershipId) as { id: number; encrypted_context: string } | undefined;
  if (!row) return null;
  const used = db.prepare("UPDATE google_oauth_state SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL").run(row.id);
  if (used.changes !== 1) return null;
  const context = `google-oauth:${actor.sessionId}:${actor.identityId}:${actor.companyId}`;
  return { actor, verifier: decryptIntegrationSecret(row.encrypted_context, context).verifier };
}

type GoogleRequestResult = { status: number; data: any; headers: Headers };

async function googleRequest(path: string, accessToken: string, init: RequestInit = {}): Promise<GoogleRequestResult> {
  if (integrationProviderIsFake()) {
    const failure = process.env.GOOGLE_FAKE_FAILURE;
    if (failure === "revoked") throw new GoogleCalendarError("GOOGLE_AUTHORIZATION_REVOKED", "authorization", 401);
    if (failure === "missing_scope") throw new GoogleCalendarError("GOOGLE_PERMISSION_MISSING", "permission", 403);
    if (failure === "outage") throw new GoogleCalendarError("GOOGLE_PROVIDER_UNAVAILABLE", "transient", 503);
    const parsedBody = typeof init.body === "string" && init.body ? JSON.parse(init.body) : {};
    if (path === "/calendars" && init.method === "POST") return { status: 200, data: { id: "fake-dialoggg-calendar" }, headers: new Headers() };
    if (path.includes("/events") && init.method === "POST") return { status: 200, data: { id: parsedBody.id, etag: '"fake-created"' }, headers: new Headers() };
    if (path.includes("/events/") && init.method === "PUT") return { status: 200, data: { id: path.split("/").at(-1), etag: '"fake-updated"' }, headers: new Headers() };
    return { status: 200, data: { id: path.split("/").at(-1) }, headers: new Headers() };
  }

  let response: Response;
  try {
    response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...(init.headers || {}) },
      cache: "no-store",
    });
  } catch {
    throw new GoogleCalendarError("GOOGLE_PROVIDER_UNAVAILABLE", "transient", 503);
  }
  let data: any = null;
  if (response.status !== 204) {
    try { data = await response.json(); } catch { data = null; }
  }
  if (!response.ok) {
    if (response.status === 401) throw new GoogleCalendarError("GOOGLE_AUTHORIZATION_REVOKED", "authorization", 401);
    if (response.status === 403) {
      const reason = data?.error?.errors?.[0]?.reason;
      if (["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(reason)) throw new GoogleCalendarError("GOOGLE_RATE_LIMITED", "transient", 429);
      throw new GoogleCalendarError("GOOGLE_PERMISSION_MISSING", "permission", 403);
    }
    if (response.status === 429 || response.status >= 500 || response.status === 404) {
      throw new GoogleCalendarError(`GOOGLE_PROVIDER_${response.status}`, "transient", response.status);
    }
    throw new GoogleCalendarError(`GOOGLE_REQUEST_${response.status}`, "permanent", response.status);
  }
  return { status: response.status, data, headers: response.headers };
}

async function ensureDedicatedCalendar(accessToken: string, existingId: string | null, timeZone: string) {
  if (existingId) {
    try {
      await googleRequest(`/calendars/${encodeURIComponent(existingId)}`, accessToken);
      return existingId;
    } catch (error) {
      if (!(error instanceof GoogleCalendarError) || error.status !== 404) throw error;
    }
  }
  const created = await googleRequest("/calendars", accessToken, {
    method: "POST",
    body: JSON.stringify({ summary: "Dialoggg", description: "Schedule items managed by Dialoggg.", timeZone }),
  });
  if (!created.data?.id) throw new GoogleCalendarError("GOOGLE_CALENDAR_CREATE_FAILED", "permanent", 502);
  return String(created.data.id);
}

export async function completeGoogleAuthorization(input: { actor: Actor; code: string; verifier: string }) {
  requireCompanyActor(input.actor);
  const platform = platformGoogleConfig(true);
  let tokens;
  try {
    tokens = await exchangeGoogleAuthorization(input.code, input.verifier, platform.config, platform.secrets);
    requireGoogleScope(tokens.scope);
  } catch (error) {
    if (error instanceof IntegrationProviderError) {
      const kind: GoogleFailureKind = error.code === "GOOGLE_SCOPE_MISSING" ? "permission" : error.code === "PROVIDER_UNREACHABLE" ? "transient" : "authorization";
      throw new GoogleCalendarError(error.code, kind, kind === "transient" ? 503 : 400);
    }
    throw error;
  }
  const current = connectionFor(input.actor.identityId, input.actor.companyId!);
  const priorRefresh = !tokens.refreshToken && current && current.token_ciphertext !== "revoked" ? parseToken(current) : null;
  const refreshToken = tokens.refreshToken || priorRefresh;
  if (!refreshToken) throw new GoogleCalendarError("GOOGLE_REFRESH_TOKEN_MISSING", "authorization", 400);
  const priorCalendar = current ? parseCalendarId(current) : null;
  const calendarId = await ensureDedicatedCalendar(tokens.accessToken, priorCalendar, input.actor.companyTimeZone || "UTC");

  const connectionId = db.transaction(() => {
    let row = connectionFor(input.actor.identityId, input.actor.companyId!);
    if (!row) {
      const result = db.prepare(`
        INSERT INTO google_connection (
          identity_id, company_id, membership_id, token_ciphertext, token_key_version,
          state, granted_scope, created_at, updated_at
        ) VALUES (?, ?, ?, 'pending', 1, 'connecting', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(input.actor.identityId, input.actor.companyId, input.actor.membershipId, tokens.scope);
      row = connectionById(Number(result.lastInsertRowid));
    }
    if (!row) throw new Error("GOOGLE_CONNECTION_CREATE_FAILED");
    const version = row.token_key_version + (current ? 1 : 0);
    db.prepare(`
      UPDATE google_connection SET token_ciphertext = ?, token_key_version = ?, calendar_id_ciphertext = ?,
        granted_scope = ?, state = 'healthy', pause_reason = NULL, disconnect_mode = NULL,
        last_success_at = CURRENT_TIMESTAMP, last_attempt_at = CURRENT_TIMESTAMP,
        last_error_code = NULL, retry_after = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      encryptIntegrationSecret({ refreshToken }, tokenContext(row.id, version)),
      version,
      encryptIntegrationSecret({ calendarId }, calendarContext(row.id, version)),
      tokens.scope,
      row.id,
    );
    queueGoogleConnection(row.id, "connect");
    return row.id;
  })();
  return { connectionId };
}

function actorForConnection(connection: ConnectionRow): Actor {
  const row = db.prepare(`
    SELECT i.normalized_email, i.first_name, i.last_name, i.legacy_user_id,
      cm.role, c.name AS company_name, c.time_zone
    FROM company_membership cm
    JOIN identity i ON i.id = cm.identity_id
    JOIN company c ON c.id = cm.company_id
    WHERE cm.id = ? AND cm.identity_id = ? AND cm.company_id = ? AND cm.status = 'active'
  `).get(connection.membership_id, connection.identity_id, connection.company_id) as {
    normalized_email: string; first_name: string; last_name: string; legacy_user_id: number | null;
    role: CompanyRole; company_name: string; time_zone: string;
  } | undefined;
  if (!row) throw new GoogleCalendarError("GOOGLE_MEMBERSHIP_INACTIVE", "permanent", 409);
  return {
    sessionId: 0,
    identityId: connection.identity_id,
    legacyUserId: row.legacy_user_id,
    membershipId: connection.membership_id,
    email: row.normalized_email,
    firstName: row.first_name,
    lastName: row.last_name,
    contextType: "company",
    companyId: connection.company_id,
    companyName: row.company_name,
    companyTimeZone: row.time_zone,
    companyRole: row.role,
    actualCompanyRole: row.role,
    rolePreview: false,
    isPlatformAdmin: false,
    isPrimaryPlatformAdmin: false,
    csrfHash: "",
    expiresAt: "",
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function itemKey(item: DeliveryItem) {
  return `${item.sourceType}:${item.sourceId}:${item.occurrenceKey}`;
}

function googleEventId(connectionId: number, item: DeliveryItem) {
  return `d${createHash("sha256").update(`${connectionId}:${itemKey(item)}`).digest("hex")}`;
}

function eligibleGoogleItemsForActor(actor: Actor): DeliveryItem[] {
  requireCompanyActor(actor);
  const resources = db.prepare("SELECT id FROM resource WHERE linked_membership_id = ? AND company_id = ? AND status = 'active'")
    .all(actor.membershipId!, actor.companyId!) as Array<{ id: number }>;
  const resourceIds = new Set(resources.map(item => item.id));
  const external = actor.companyRole === "external";
  const taskRows = db.prepare(`
    SELECT DISTINCT t.id, t.name, t.start_date, t.duration, t.version, t.allow_saturday, t.allow_sunday,
      p.id AS project_id, p.name AS project_name
    FROM task t
    JOIN project p ON p.id = t.project_id
    ${external ? "JOIN project_membership pm ON pm.project_id = p.id AND pm.company_membership_id = ?" : "JOIN task_resource tr ON tr.task_id = t.id JOIN resource r ON r.id = tr.resource_id AND r.linked_membership_id = ?"}
    WHERE p.company_id = ? AND p.status = 'active' AND t.is_header = 0
      ${external ? "AND t.external_visible = 1" : ""}
    ORDER BY t.id
  `).all(actor.membershipId!, actor.companyId!) as Array<{
    id: number; name: string; start_date: string; duration: number; version: number;
    allow_saturday: number; allow_sunday: number; project_id: number; project_name: string;
  }>;

  const tasks: DeliveryItem[] = taskRows.map(task => ({
    sourceType: "task",
    sourceId: String(task.id),
    occurrenceKey: "",
    sourceVersion: task.version,
    payload: {
      summary: `${task.project_name} — ${task.name}`,
      description: MANAGED_DESCRIPTION,
      start: { date: task.start_date },
      end: { date: addDays(workingDayEnd(task.start_date, task.duration, { allowSaturday: !!task.allow_saturday, allowSunday: !!task.allow_sunday }), 1) },
      reminders: { useDefault: true },
      extendedProperties: { private: { dialogggSource: `task:${task.id}` } },
    },
  }));

  const now = new Date();
  const rangeStart = new Date(now.getTime() - 366 * 86_400_000).toISOString();
  const rangeEnd = new Date(now.getTime() + 732 * 86_400_000).toISOString();
  const occurrences = listEventOccurrences(actor, { rangeStart, rangeEnd, includeArchived: false })
    .filter(item => external || item.resourceIds.some(resourceId => resourceIds.has(resourceId)));
  const events: DeliveryItem[] = occurrences.map(event => ({
    sourceType: "event",
    sourceId: String(event.seriesId),
    occurrenceKey: event.occurrenceKey,
    sourceVersion: event.version,
    payload: {
      summary: `${event.projectName ? `${event.projectName} — ` : ""}${event.title}`,
      description: MANAGED_DESCRIPTION,
      start: event.allDay ? { date: event.start } : { dateTime: event.start, timeZone: event.timeZone },
      end: event.allDay ? { date: event.end } : { dateTime: event.end, timeZone: event.timeZone },
      reminders: { useDefault: true },
      extendedProperties: { private: { dialogggSource: `event:${event.seriesId}:${event.occurrenceKey}` } },
    },
  }));
  return [...tasks, ...events];
}

export function eligibleGoogleItems(connectionId: number): DeliveryItem[] {
  const connection = connectionById(connectionId);
  if (!connection) throw new GoogleCalendarError("GOOGLE_CONNECTION_NOT_FOUND", "permanent", 404);
  return eligibleGoogleItemsForActor(actorForConnection(connection));
}

export function googleCalendarItemPreview(actor: Actor) {
  const now = Date.now();
  const candidates = eligibleGoogleItemsForActor(actor).flatMap(item => {
    const start = item.payload.start as { date?: string; dateTime?: string; timeZone?: string } | undefined;
    const end = item.payload.end as { date?: string; dateTime?: string; timeZone?: string } | undefined;
    const startValue = start?.dateTime ?? start?.date;
    const endValue = end?.dateTime ?? end?.date;
    if (!start || !end || !startValue || !endValue) return [];
    const allDay = Boolean(start.date);
    const startMs = allDay ? Date.parse(`${startValue}T00:00:00Z`) : Date.parse(startValue);
    const endMs = allDay ? Date.parse(`${endValue}T00:00:00Z`) : Date.parse(endValue);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= now) return [];
    return [{
      sourceType: item.sourceType,
      title: String(item.payload.summary ?? "Scheduled item"),
      start: startValue,
      end: endValue,
      allDay,
      timeZone: start.timeZone ?? end.timeZone ?? actor.companyTimeZone,
      reminders: "Google default reminders" as const,
      sortAt: startMs,
    }];
  }).sort((left, right) => left.sortAt - right.sortAt);
  const first = candidates[0];
  if (!first) return null;
  const { sortAt: _sortAt, ...preview } = first;
  return preview;
}

async function accessFor(connection: ConnectionRow) {
  const platform = platformGoogleConfig(true);
  try {
    return await refreshGoogleAccessToken(parseToken(connection), platform.config, platform.secrets);
  } catch (error) {
    if (error instanceof IntegrationProviderError) {
      if (error.code === "PROVIDER_UNREACHABLE") throw new GoogleCalendarError("GOOGLE_PROVIDER_UNAVAILABLE", "transient", 503);
      if (error.code.includes("400") || error.code.includes("REJECTED")) throw new GoogleCalendarError("GOOGLE_AUTHORIZATION_REVOKED", "authorization", 401);
    }
    throw error;
  }
}

export async function reconcileGoogleConnection(connectionId: number, triggerKind: "connect" | "change" | "manual" | "resume" | "retry" | "worker" = "worker") {
  const connection = connectionById(connectionId);
  if (!connection) throw new GoogleCalendarError("GOOGLE_CONNECTION_NOT_FOUND", "permanent", 404);
  const companyState = db.prepare("SELECT state, pause_reason FROM company_google_sync_state WHERE company_id = ?").get(connection.company_id) as { state: string; pause_reason: string | null } | undefined;
  if (connection.state === "paused" || companyState?.state === "paused") throw new GoogleCalendarError("GOOGLE_SYNC_PAUSED", "permanent", 409);
  if (connection.state !== "healthy") throw new GoogleCalendarError("GOOGLE_CONNECTION_REQUIRED", "authorization", 409);

  const runId = Number(db.prepare("INSERT INTO google_sync_run (connection_id, trigger_kind, status) VALUES (?, ?, 'started')").run(connectionId, triggerKind).lastInsertRowid);
  const counts = { created: 0, updated: 0, deleted: 0, unchanged: 0 };
  try {
    db.prepare("UPDATE google_connection SET last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(connectionId);
    const accessToken = await accessFor(connection);
    const storedCalendarId = parseCalendarId(connection);
    if (!storedCalendarId) throw new GoogleCalendarError("GOOGLE_CALENDAR_MISSING", "permanent", 409);
    const connectionActor = actorForConnection(connection);
    const calendarId = await ensureDedicatedCalendar(accessToken, storedCalendarId, connectionActor.companyTimeZone || "UTC");
    if (calendarId !== storedCalendarId) {
      db.prepare("UPDATE google_connection SET calendar_id_ciphertext = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(encryptIntegrationSecret({ calendarId }, calendarContext(connection.id, connection.token_key_version)), connection.id);
    }
    const desired = new Map(eligibleGoogleItems(connectionId).map(item => [itemKey(item), item]));
    const mappings = db.prepare("SELECT * FROM google_item_mapping WHERE connection_id = ?").all(connectionId) as Array<any>;
    const mapped = new Map(mappings.map(row => [`${row.source_type}:${row.source_id}:${row.occurrence_key}`, row]));

    for (const [key, item] of desired) {
      const payloadHash = sha256(canonical(item.payload));
      const existing = mapped.get(key);
      if (existing?.payload_hash === payloadHash && existing.sync_state !== "error") { counts.unchanged += 1; continue; }
      const eventId = existing?.google_event_id || googleEventId(connectionId, item);
      let result: GoogleRequestResult;
      if (existing) {
        try {
          result = await googleRequest(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, accessToken, { method: "PUT", body: JSON.stringify({ id: eventId, ...item.payload }) });
        } catch (error) {
          if (!(error instanceof GoogleCalendarError) || ![404, 410].includes(error.status)) throw error;
          result = await googleRequest(`/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, { method: "POST", body: JSON.stringify({ id: eventId, ...item.payload }) });
        }
        counts.updated += 1;
      } else {
        try {
          result = await googleRequest(`/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, { method: "POST", body: JSON.stringify({ id: eventId, ...item.payload }) });
        } catch (error) {
          if (!(error instanceof GoogleCalendarError) || error.status !== 409) throw error;
          result = await googleRequest(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, accessToken, { method: "PUT", body: JSON.stringify({ id: eventId, ...item.payload }) });
        }
        counts.created += 1;
      }
      db.prepare(`
        INSERT INTO google_item_mapping (
          connection_id, source_type, source_id, occurrence_key, google_event_id, google_etag,
          source_version, payload_hash, sync_state, last_error_code, last_synced_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(connection_id, source_type, source_id, occurrence_key) DO UPDATE SET
          google_event_id = excluded.google_event_id, google_etag = excluded.google_etag,
          source_version = excluded.source_version, payload_hash = excluded.payload_hash,
          sync_state = excluded.sync_state, last_error_code = NULL,
          last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      `).run(connectionId, item.sourceType, item.sourceId, item.occurrenceKey, eventId, result.data?.etag || null, item.sourceVersion, payloadHash, existing ? "updated" : "created");
    }

    for (const [key, mapping] of mapped) {
      if (desired.has(key)) continue;
      try {
        await googleRequest(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(mapping.google_event_id)}`, accessToken, { method: "DELETE" });
      } catch (error) {
        if (!(error instanceof GoogleCalendarError) || ![404, 410].includes(error.status)) throw error;
      }
      db.prepare("DELETE FROM google_item_mapping WHERE id = ? AND connection_id = ?").run(mapping.id, connectionId);
      counts.deleted += 1;
    }

    db.transaction(() => {
      db.prepare(`UPDATE google_connection SET state = 'healthy', last_success_at = CURRENT_TIMESTAMP,
        last_reconciled_at = CURRENT_TIMESTAMP, last_error_code = NULL, retry_after = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(connectionId);
      db.prepare(`UPDATE google_sync_run SET status = 'completed', created_count = ?, updated_count = ?,
        deleted_count = ?, unchanged_count = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(counts.created, counts.updated, counts.deleted, counts.unchanged, runId);
    })();
    return counts;
  } catch (error) {
    const domain = error instanceof GoogleCalendarError ? error : new GoogleCalendarError("GOOGLE_SYNC_FAILED", "transient", 503);
    db.transaction(() => {
      db.prepare(`UPDATE google_connection SET state = CASE WHEN ? IN ('authorization','permission') THEN 'action_required' ELSE state END,
        last_error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(domain.kind, domain.code, connectionId);
      db.prepare("UPDATE google_sync_run SET status = 'failed', error_code = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(domain.code, runId);
    })();
    throw domain;
  }
}

export async function processGoogleOutbox(limit = 25, onlyConnectionId?: number) {
  const rows = db.prepare(`
    SELECT id, idempotency_key, payload_json, attempts, created_at
    FROM outbox_job
    WHERE kind = 'google_calendar_reconcile' AND status IN ('pending','retry')
      AND next_attempt_at <= CURRENT_TIMESTAMP
      ${onlyConnectionId ? "AND json_extract(payload_json, '$.connectionId') = ?" : ""}
    ORDER BY id LIMIT ?
  `).all(...(onlyConnectionId ? [onlyConnectionId, limit] : [limit])) as Array<{ id: number; idempotency_key: string; payload_json: string; attempts: number; created_at: string }>;
  const result = { completed: 0, deferred: 0, dead: 0 };
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json) as { connectionId: number; reason: string };
    const claimed = db.prepare(`UPDATE outbox_job SET status = 'running', locked_at = CURRENT_TIMESTAMP,
      locked_by = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending','retry')`)
      .run(`google-worker:${process.pid}`, row.id);
    if (claimed.changes !== 1) continue;
    try {
      await reconcileGoogleConnection(payload.connectionId, "worker");
      db.prepare(`UPDATE outbox_job SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
        locked_at = NULL, locked_by = NULL, last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
      result.completed += 1;
    } catch (error) {
      const domain = error instanceof GoogleCalendarError ? error : new GoogleCalendarError("GOOGLE_SYNC_FAILED", "transient", 503);
      if (domain.code === "GOOGLE_SYNC_PAUSED") {
        db.prepare(`UPDATE outbox_job SET status = 'retry', next_attempt_at = datetime('now', '+1 hour'),
          locked_at = NULL, locked_by = NULL, last_error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(domain.code, row.id);
        result.deferred += 1;
        continue;
      }
      const elapsed = Date.now() - Date.parse(row.created_at);
      const dead = domain.kind !== "transient" || elapsed >= 24 * 3_600_000;
      const attempt = row.attempts + 1;
      const delaySeconds = Math.min(3600, 2 ** Math.min(attempt, 11) + Math.floor(Math.random() * 30));
      db.prepare(`UPDATE outbox_job SET status = ?, next_attempt_at = datetime('now', ?),
        locked_at = NULL, locked_by = NULL, last_error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(dead ? "dead" : "retry", `+${delaySeconds} seconds`, domain.code, row.id);
      if (dead) {
        db.prepare("UPDATE google_sync_run SET status = 'dead' WHERE connection_id = ? AND status = 'failed' AND id = (SELECT MAX(id) FROM google_sync_run WHERE connection_id = ?)").run(payload.connectionId, payload.connectionId);
        result.dead += 1;
      } else result.deferred += 1;
    }
  }
  return result;
}

export function googleConnectionSnapshot(actor: Actor) {
  requireCompanyActor(actor);
  const connection = connectionFor(actor.identityId, actor.companyId!);
  const companySync = db.prepare("SELECT state, pause_reason, updated_at FROM company_google_sync_state WHERE company_id = ?").get(actor.companyId) as { state: string; pause_reason: string | null; updated_at: string } | undefined;
  const jobs = connection ? db.prepare(`SELECT status, COUNT(*) AS count FROM outbox_job
    WHERE kind = 'google_calendar_reconcile' AND json_extract(payload_json, '$.connectionId') = ? GROUP BY status`).all(connection.id) as Array<{ status: string; count: number }> : [];
  const counts = Object.fromEntries(jobs.map(row => [row.status, row.count]));
  return {
    state: connection?.state ?? "connection_required",
    pauseReason: connection?.pause_reason ?? companySync?.pause_reason ?? null,
    companySyncState: companySync?.state ?? "active",
    scope: connection?.granted_scope ? GOOGLE_SCOPE : null,
    lastSuccessAt: connection?.last_success_at ?? null,
    lastAttemptAt: connection?.last_attempt_at ?? null,
    lastReconciledAt: connection?.last_reconciled_at ?? null,
    lastErrorCode: connection?.last_error_code ?? null,
    health: {
      pending: Number(counts.pending || 0) + Number(counts.retry || 0),
      dead: Number(counts.dead || 0),
      managedItems: connection ? (db.prepare("SELECT COUNT(*) AS count FROM google_item_mapping WHERE connection_id = ?").get(connection.id) as { count: number }).count : 0,
    },
  };
}

export function markGoogleConnectionFailure(actor: Actor, code: string, kind: GoogleFailureKind) {
  if (!actor.companyId) return;
  const connection = connectionFor(actor.identityId, actor.companyId);
  if (!connection) return;
  db.prepare(`UPDATE google_connection SET state = CASE WHEN ? IN ('authorization','permission') THEN 'action_required' ELSE state END,
    last_attempt_at = CURRENT_TIMESTAMP, last_error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(kind, String(code).slice(0, 120), connection.id);
}

export async function disconnectGoogle(actor: Actor, mode: "remove" | "retain") {
  requireCompanyActor(actor);
  const connection = connectionFor(actor.identityId, actor.companyId!);
  if (!connection) return { disconnected: true };
  if (mode === "remove" && connection.state === "healthy") {
    const accessToken = await accessFor(connection);
    const calendarId = parseCalendarId(connection);
    if (calendarId) {
      try { await googleRequest(`/calendars/${encodeURIComponent(calendarId)}`, accessToken, { method: "DELETE" }); }
      catch (error) { if (!(error instanceof GoogleCalendarError) || ![404, 410].includes(error.status)) throw error; }
    }
    db.prepare("DELETE FROM google_item_mapping WHERE connection_id = ?").run(connection.id);
  } else {
    db.prepare("UPDATE google_item_mapping SET sync_state = 'retained', updated_at = CURRENT_TIMESTAMP WHERE connection_id = ?").run(connection.id);
  }
  db.transaction(() => {
    db.prepare(`UPDATE google_connection SET state = 'disconnected', disconnect_mode = ?, token_ciphertext = 'revoked',
      calendar_id_ciphertext = NULL, last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(mode, connection.id);
    db.prepare(`UPDATE outbox_job SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE kind = 'google_calendar_reconcile' AND status IN ('pending','retry','running')
        AND json_extract(payload_json, '$.connectionId') = ?`).run(connection.id);
  })();
  return { disconnected: true };
}

export function resumeGoogle(actor: Actor) {
  requireCompanyActor(actor);
  if (!["owner", "admin"].includes(actor.companyRole || "")) throw new GoogleCalendarError("GOOGLE_RESUME_MANAGER_REQUIRED", "permanent", 403);
  db.transaction(() => {
    db.prepare(`INSERT INTO company_google_sync_state (company_id, state, pause_reason, paused_at, updated_at)
      VALUES (?, 'active', NULL, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(company_id) DO UPDATE SET state = 'active', pause_reason = NULL, paused_at = NULL, updated_at = CURRENT_TIMESTAMP`).run(actor.companyId);
    db.prepare("UPDATE google_connection SET state = 'healthy', pause_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND state = 'paused'").run(actor.companyId);
    const connections = db.prepare("SELECT id FROM google_connection WHERE company_id = ? AND state = 'healthy'").all(actor.companyId) as Array<{ id: number }>;
    for (const row of connections) queueGoogleConnection(row.id, "resume");
  })();
  return { resumed: true };
}

export function retryGoogle(actor: Actor) {
  requireCompanyActor(actor);
  const connection = connectionFor(actor.identityId, actor.companyId!);
  if (!connection) throw new GoogleCalendarError("GOOGLE_CONNECTION_REQUIRED", "authorization", 409);
  db.prepare(`UPDATE outbox_job SET status = 'retry', next_attempt_at = CURRENT_TIMESTAMP,
    last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE kind = 'google_calendar_reconcile'
      AND status = 'dead' AND json_extract(payload_json, '$.connectionId') = ?`).run(connection.id);
  queueGoogleConnection(connection.id, "manual-retry");
  return connection.id;
}
