import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

import db from "@/db";
import type { Actor } from "@/lib/auth";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  integrationSecretFingerprint,
  integrationSecretLastFour,
} from "@/lib/integration-crypto";
import { validateRequestOrigin } from "@/lib/request-security";
import { sha256 } from "@/lib/security";

export type IntegrationProvider = "google_platform" | "microsoft_platform" | "microsoft_company" | "resend_platform";
export type IntegrationStatus = "not_started" | "saved" | "action_required" | "verified";
export type InvitationScope = "platform" | "company" | "platform_and_company";

export const INTEGRATION_SESSION_COOKIE = "dialoggg_integration_session";
export const INTEGRATION_CSRF_COOKIE = "dialoggg_integration_csrf";

type InvitationRow = {
  id: number;
  access_kind: "workshop" | "review";
  scope_kind: InvitationScope;
  company_id: number | null;
  label: string;
  expires_at: string;
  completed_at: string | null;
  company_name: string | null;
};

export type IntegrationSession = InvitationRow & {
  sessionId: number;
  csrfHash: string;
};

type ConfigRow = {
  id: number;
  provider: IntegrationProvider;
  company_id: number | null;
  environment: "test" | "production";
  non_secret_json: string;
  status: IntegrationStatus;
  safe_status_code: string | null;
  credential_version: number;
  saved_at: string | null;
  verified_at: string | null;
  updated_at: string;
  fingerprint: string | null;
  last_four: string | null;
  disabled_at: string | null;
};

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = ["google_platform", "microsoft_platform", "resend_platform"];

function insertIntegrationInvitation(input: {
  accessKind: "workshop" | "review";
  scopeKind: InvitationScope;
  companyId: number | null;
  label: string;
  expiresAt: string;
  createdByIdentityId: number;
  tokenHash: string;
}) {
  if (input.scopeKind === "platform" && input.companyId !== null) throw new Error("INVITATION_SCOPE_INVALID");
  if (input.scopeKind !== "platform" && !input.companyId) throw new Error("INVITATION_SCOPE_INVALID");
  if (!/^[a-f0-9]{64}$/.test(input.tokenHash)) throw new Error("INVITATION_HASH_INVALID");
  const result = db.prepare(`
    INSERT INTO integration_setup_invitation (
      token_hash, access_kind, scope_kind, company_id, label, expires_at, created_by_identity_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.tokenHash, input.accessKind, input.scopeKind, input.companyId,
    input.label.trim().slice(0, 120), input.expiresAt, input.createdByIdentityId,
  );
  return { id: Number(result.lastInsertRowid) };
}

export function rotateIntegrationInvitation(input: {
  scopeKind: InvitationScope;
  companyId: number | null;
  label: string;
  expiresAt: string;
  createdByIdentityId: number;
  workshopTokenHash: string;
  reviewTokenHash: string;
}) {
  return db.transaction(() => {
    db.prepare(`
      UPDATE integration_setup_invitation SET revoked_at = CURRENT_TIMESTAMP
      WHERE scope_kind = ? AND company_id IS ? AND revoked_at IS NULL
    `).run(input.scopeKind, input.companyId);
    const workshop = insertIntegrationInvitation({ ...input, accessKind: "workshop", tokenHash: input.workshopTokenHash });
    const review = insertIntegrationInvitation({ ...input, accessKind: "review", tokenHash: input.reviewTokenHash });
    return { workshop, review };
  })();
}

export function exchangeIntegrationInvitation(rawToken: string) {
  const invitation = db.prepare(`
    SELECT i.id, i.access_kind, i.scope_kind, i.company_id, i.label, i.expires_at,
      i.completed_at, c.name AS company_name
    FROM integration_setup_invitation i
    LEFT JOIN company c ON c.id = i.company_id
    WHERE i.token_hash = ? AND i.revoked_at IS NULL AND i.expires_at > CURRENT_TIMESTAMP
  `).get(sha256(rawToken)) as InvitationRow | undefined;
  if (!invitation) return null;

  const sessionToken = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const invitationExpiry = Date.parse(invitation.expires_at);
  const expiresAt = new Date(Math.min(invitationExpiry, Date.now() + 8 * 3_600_000)).toISOString();
  const result = db.prepare(`
    INSERT INTO integration_setup_session (invitation_id, token_hash, csrf_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(invitation.id, sha256(sessionToken), sha256(csrfToken), expiresAt);
  db.prepare("UPDATE integration_setup_invitation SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?").run(invitation.id);
  return { invitation, sessionId: Number(result.lastInsertRowid), sessionToken, csrfToken, expiresAt };
}

export function integrationSession(rawToken: string | undefined): IntegrationSession | null {
  if (!rawToken) return null;
  const row = db.prepare(`
    SELECT s.id AS session_id, s.csrf_hash, i.id, i.access_kind, i.scope_kind, i.company_id,
      i.label, i.expires_at, i.completed_at, c.name AS company_name
    FROM integration_setup_session s
    JOIN integration_setup_invitation i ON i.id = s.invitation_id
    LEFT JOIN company c ON c.id = i.company_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
      AND i.revoked_at IS NULL AND i.expires_at > CURRENT_TIMESTAMP
  `).get(sha256(rawToken)) as (InvitationRow & { session_id: number; csrf_hash: string }) | undefined;
  if (!row) return null;
  db.prepare("UPDATE integration_setup_session SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.session_id);
  return { ...row, sessionId: row.session_id, csrfHash: row.csrf_hash };
}

export function validateIntegrationMutation(request: NextRequest, session: IntegrationSession, csrfToken: string | undefined) {
  if (!validateRequestOrigin(request)) return "ORIGIN_REJECTED";
  const header = request.headers.get("x-workshop-csrf");
  if (!csrfToken || !header || header !== csrfToken || sha256(header) !== session.csrfHash) return "CSRF_REJECTED";
  return null;
}

function providerAllowed(session: Pick<IntegrationSession, "scope_kind">, provider: IntegrationProvider) {
  if (provider === "microsoft_company") return session.scope_kind !== "platform";
  return session.scope_kind !== "company";
}

function parseJson(value: string) {
  try { return JSON.parse(value) as Record<string, string>; } catch { return {}; }
}

function latestValidationDetails(configId: number | undefined, operation?: "validate" | "test_email") {
  if (!configId) return { operation: null, status: null, errorCode: null, details: {}, completedAt: null };
  const row = db.prepare(`
    SELECT operation, status, error_code, safe_details_json, completed_at
    FROM integration_validation_attempt
    WHERE config_id = ? AND status IN ('passed','failed') AND (? IS NULL OR operation = ?)
    ORDER BY id DESC LIMIT 1
  `).get(configId, operation ?? null, operation ?? null) as {
    operation: string;
    status: string;
    error_code: string | null;
    safe_details_json: string;
    completed_at: string | null;
  } | undefined;
  return {
    operation: row?.operation ?? null,
    status: row?.status ?? null,
    errorCode: row?.error_code ?? null,
    details: row ? parseJson(row.safe_details_json) : {},
    completedAt: row?.completed_at ?? null,
  };
}

export function callbackUri(provider: "google" | "microsoft") {
  const origin = process.env.APP_BASE_URL?.replace(/\/$/, "");
  if (!origin || (process.env.NODE_ENV === "production" && process.env.INTEGRATION_PROVIDER_MODE !== "fake" && !origin.startsWith("https://"))) {
    throw new Error("APP_BASE_URL_INVALID");
  }
  return `${origin}/api/integrations/oauth/${provider}/callback`;
}

export function integrationSnapshot(session: IntegrationSession) {
  const rows = db.prepare(`
    SELECT ic.*, cv.fingerprint, cv.last_four
    FROM integration_config ic
    LEFT JOIN integration_credential_version cv ON cv.config_id = ic.id AND cv.is_active = 1
    WHERE (ic.company_id IS NULL OR ic.company_id = ?)
    ORDER BY ic.id
  `).all(session.company_id) as ConfigRow[];
  const byProvider = new Map(rows.map(row => [row.provider, row]));
  const items = INTEGRATION_PROVIDERS.filter(provider => providerAllowed(session, provider)).map(provider => {
    const row = byProvider.get(provider);
    return {
      provider,
      status: row?.status ?? "not_started",
      safeStatusCode: row?.safe_status_code ?? null,
      environment: row?.environment ?? "production",
      config: row ? parseJson(row.non_secret_json) : {},
      credential: row?.fingerprint ? {
        configured: true,
        fingerprint: row.fingerprint,
        lastFour: row.last_four,
        version: row.credential_version,
      } : { configured: false, fingerprint: null, lastFour: null, version: 0 },
      savedAt: row?.saved_at ?? null,
      verifiedAt: row?.verified_at ?? null,
      disabledAt: row?.disabled_at ?? null,
      updatedAt: row?.updated_at ?? null,
      callbackUri: provider === "google_platform" ? callbackUri("google") : provider === "microsoft_platform" || provider === "microsoft_company" ? callbackUri("microsoft") : null,
    };
  });
  return {
    accessKind: session.access_kind,
    invitation: {
      label: session.label,
      scopeKind: session.scope_kind,
      companyId: session.company_id,
      companyName: session.company_name,
      expiresAt: session.expires_at,
      completedAt: session.completed_at,
    },
    providers: items,
    canComplete: items.length > 0 && items.every(item => item.status === "verified"),
  };
}

function scopeForProvider(provider: IntegrationProvider, companyId: number | null) {
  return provider === "microsoft_company" ? { scope: "company", companyId } : { scope: "platform", companyId: null };
}

export function saveIntegrationConfig(input: {
  session: IntegrationSession;
  provider: IntegrationProvider;
  environment: "test" | "production";
  config: Record<string, string>;
  secrets?: Record<string, string>;
}) {
  if (!providerAllowed(input.session, input.provider)) throw new Error("PROVIDER_SCOPE_FORBIDDEN");
  if (input.provider === "microsoft_company" && !input.session.company_id) throw new Error("COMPANY_SCOPE_REQUIRED");
  const cleanConfig = Object.fromEntries(Object.entries(input.config).map(([key, value]) => [key, String(value ?? "").trim().slice(0, 500)]));
  const scope = scopeForProvider(input.provider, input.session.company_id);
  return db.transaction(() => {
    db.prepare(`
      INSERT INTO integration_config (provider, scope_kind, company_id, environment, non_secret_json, status, saved_at)
      VALUES (?, ?, ?, ?, ?, 'saved', CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING
    `).run(input.provider, scope.scope, scope.companyId, input.environment, JSON.stringify(cleanConfig));
    const row = db.prepare(`
      SELECT ic.id, ic.credential_version,
        COALESCE((SELECT MAX(cv.version) FROM integration_credential_version cv WHERE cv.config_id = ic.id), 0) AS latest_version
      FROM integration_config ic
      WHERE ic.provider = ? AND ic.company_id IS ?
    `).get(input.provider, scope.companyId) as { id: number; credential_version: number; latest_version: number };
    db.prepare(`
      UPDATE integration_config SET environment = ?, non_secret_json = ?, status = 'saved',
        safe_status_code = NULL, verified_at = NULL, saved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.environment, JSON.stringify(cleanConfig), row.id);

    const secrets = Object.fromEntries(Object.entries(input.secrets ?? {}).filter(([, value]) => String(value).length > 0).map(([key, value]) => [key, String(value)]));
    if (Object.keys(secrets).length > 0) {
      const version = row.latest_version + 1;
      const context = `integration:${row.id}:v${version}`;
      const primary = secrets.clientSecret || secrets.apiKey || secrets.certificate || Object.values(secrets)[0];
      db.prepare(`UPDATE integration_credential_version SET is_active = 0, retired_at = CURRENT_TIMESTAMP WHERE config_id = ? AND is_active = 1`).run(row.id);
      db.prepare(`
        INSERT INTO integration_credential_version (
          config_id, version, encrypted_envelope, fingerprint, last_four
        ) VALUES (?, ?, ?, ?, ?)
      `).run(row.id, version, encryptIntegrationSecret(secrets, context), integrationSecretFingerprint(secrets), integrationSecretLastFour(primary));
      db.prepare("UPDATE integration_config SET credential_version = ? WHERE id = ?").run(version, row.id);
    }
    const active = db.prepare("SELECT 1 FROM integration_credential_version WHERE config_id = ? AND is_active = 1").get(row.id);
    if (!active) throw new Error("SECRET_REQUIRED");
    return row.id;
  })();
}

export function autosaveIntegrationConfig(input: {
  session: IntegrationSession;
  provider: IntegrationProvider;
  environment: "test" | "production";
  config: Record<string, string>;
}) {
  if (!providerAllowed(input.session, input.provider)) throw new Error("PROVIDER_SCOPE_FORBIDDEN");
  if (input.provider === "microsoft_company" && !input.session.company_id) throw new Error("COMPANY_SCOPE_REQUIRED");
  const cleanConfig = Object.fromEntries(Object.entries(input.config).map(([key, value]) => [key, String(value ?? "").trim().slice(0, 500)]));
  const scope = scopeForProvider(input.provider, input.session.company_id);
  return db.transaction(() => {
    db.prepare(`
      INSERT INTO integration_config (provider, scope_kind, company_id, environment, non_secret_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `).run(input.provider, scope.scope, scope.companyId, input.environment, JSON.stringify(cleanConfig));
    const row = db.prepare(`SELECT id, credential_version FROM integration_config WHERE provider = ? AND company_id IS ?`)
      .get(input.provider, scope.companyId) as { id: number; credential_version: number };
    db.prepare(`
      UPDATE integration_config SET environment = ?, non_secret_json = ?,
        status = CASE WHEN credential_version > 0 THEN 'saved' ELSE 'not_started' END,
        safe_status_code = NULL, verified_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.environment, JSON.stringify(cleanConfig), row.id);
    return row.id;
  })();
}

export function activeIntegrationCredential(configId: number) {
  const row = db.prepare(`
    SELECT cv.encrypted_envelope, cv.version
    FROM integration_credential_version cv
    WHERE cv.config_id = ? AND cv.is_active = 1
  `).get(configId) as { encrypted_envelope: string; version: number } | undefined;
  if (!row) throw new Error("CREDENTIAL_NOT_CONFIGURED");
  return decryptIntegrationSecret(row.encrypted_envelope, `integration:${configId}:v${row.version}`);
}

export function configForProvider(session: IntegrationSession, provider: IntegrationProvider) {
  if (!providerAllowed(session, provider)) throw new Error("PROVIDER_SCOPE_FORBIDDEN");
  const companyId = provider === "microsoft_company" ? session.company_id : null;
  const row = db.prepare(`SELECT * FROM integration_config WHERE provider = ? AND company_id IS ?`).get(provider, companyId) as ConfigRow | undefined;
  if (!row) throw new Error("CONFIG_NOT_SAVED");
  return { ...row, config: parseJson(row.non_secret_json), secrets: activeIntegrationCredential(row.id) };
}

export function beginValidation(configId: number, invitationId: number | null, operation: "oauth" | "validate" | "test_email", requestId: string) {
  const result = db.prepare(`
    INSERT INTO integration_validation_attempt (config_id, invitation_id, operation, status, request_id)
    VALUES (?, ?, ?, 'started', ?)
  `).run(configId, invitationId, operation, requestId);
  return Number(result.lastInsertRowid);
}

export function finishValidation(
  attemptId: number,
  configId: number,
  status: "passed" | "failed",
  errorCode: string | null,
  details: Record<string, string> = {},
  updateConfigStatus = true,
) {
  db.transaction(() => {
    db.prepare(`
      UPDATE integration_validation_attempt SET status = ?, error_code = ?, safe_details_json = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, errorCode, JSON.stringify(details), attemptId);
    if (updateConfigStatus) {
      db.prepare(`
        UPDATE integration_config SET status = ?, safe_status_code = ?, verified_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status === "passed" ? "verified" : "action_required", errorCode, status === "passed" ? new Date().toISOString() : null, configId);
    }
  })();
}

function platformSession(): IntegrationSession {
  return {
    id: 0,
    access_kind: "workshop",
    scope_kind: "platform",
    company_id: null,
    label: "Platform Administration",
    expires_at: "9999-12-31T23:59:59.999Z",
    completed_at: null,
    company_name: null,
    sessionId: 0,
    csrfHash: "",
  };
}

export function platformGoogleSnapshot() {
  const row = db.prepare(`
    SELECT ic.*, cv.fingerprint, cv.last_four
    FROM integration_config ic
    LEFT JOIN integration_credential_version cv ON cv.config_id = ic.id AND cv.is_active = 1
    WHERE ic.provider = 'google_platform' AND ic.company_id IS NULL
  `).get() as ConfigRow | undefined;
  return {
    provider: "google_platform" as const,
    status: row?.status ?? "not_started",
    safeStatusCode: row?.safe_status_code ?? null,
    environment: row?.environment ?? "production",
    config: row ? parseJson(row.non_secret_json) : {},
    credential: row?.fingerprint ? {
      configured: true,
      fingerprint: row.fingerprint,
      lastFour: row.last_four,
      version: row.credential_version,
    } : { configured: false, fingerprint: null, lastFour: null, version: 0 },
    savedAt: row?.saved_at ?? null,
    verifiedAt: row?.verified_at ?? null,
    disabledAt: row?.disabled_at ?? null,
    callbackUri: callbackUri("google"),
  };
}

export function savePlatformGoogleConfig(input: {
  environment: "test" | "production";
  config: Record<string, string>;
  secrets?: Record<string, string>;
}) {
  return saveIntegrationConfig({ ...input, session: platformSession(), provider: "google_platform" });
}

export function platformGoogleConfig(requireVerified = false) {
  const saved = configForProvider(platformSession(), "google_platform");
  if (saved.disabled_at) throw new Error("GOOGLE_PLATFORM_DISABLED");
  if (requireVerified && saved.status !== "verified") throw new Error("GOOGLE_PLATFORM_VERIFICATION_REQUIRED");
  return saved;
}

export function setPlatformGoogleEnabled(enabled: boolean) {
  const row = db.prepare("SELECT id, credential_version FROM integration_config WHERE provider = 'google_platform' AND company_id IS NULL")
    .get() as { id: number; credential_version: number } | undefined;
  if (!row) throw new Error("CONFIG_NOT_SAVED");
  db.prepare(`
    UPDATE integration_config SET disabled_at = ?, status = ?, safe_status_code = ?, verified_at = NULL,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(
    enabled ? null : new Date().toISOString(),
    enabled && row.credential_version > 0 ? "saved" : "action_required",
    enabled ? "VERIFICATION_REQUIRED" : "DISABLED",
    row.id,
  );
}

export function revokePlatformGoogleConfig() {
  return revokeIntegrationProvider(platformSession(), "google_platform");
}

export function platformMicrosoftSnapshot() {
  const row = db.prepare(`
    SELECT ic.*, cv.fingerprint, cv.last_four
    FROM integration_config ic
    LEFT JOIN integration_credential_version cv ON cv.config_id = ic.id AND cv.is_active = 1
    WHERE ic.provider = 'microsoft_platform' AND ic.company_id IS NULL
  `).get() as ConfigRow | undefined;
  return {
    provider: "microsoft_platform" as const,
    status: row?.status ?? "not_started",
    safeStatusCode: row?.safe_status_code ?? null,
    environment: row?.environment ?? "production",
    config: row ? parseJson(row.non_secret_json) : {},
    credential: row?.fingerprint ? {
      configured: true,
      fingerprint: row.fingerprint,
      lastFour: row.last_four,
      version: row.credential_version,
    } : { configured: false, fingerprint: null, lastFour: null, version: 0 },
    savedAt: row?.saved_at ?? null,
    verifiedAt: row?.verified_at ?? null,
    disabledAt: row?.disabled_at ?? null,
    callbackUri: callbackUri("microsoft"),
  };
}

export function savePlatformMicrosoftConfig(input: {
  environment: "test" | "production";
  config: Record<string, string>;
  secrets?: Record<string, string>;
}) {
  return saveIntegrationConfig({ ...input, session: platformSession(), provider: "microsoft_platform" });
}

export function platformMicrosoftConfig(requireVerified = false) {
  const saved = configForProvider(platformSession(), "microsoft_platform");
  if (saved.disabled_at) throw new Error("MICROSOFT_PLATFORM_DISABLED");
  if (requireVerified && saved.status !== "verified") throw new Error("MICROSOFT_PLATFORM_VERIFICATION_REQUIRED");
  return saved;
}

export function setPlatformMicrosoftEnabled(enabled: boolean) {
  const row = db.prepare("SELECT id, credential_version FROM integration_config WHERE provider = 'microsoft_platform' AND company_id IS NULL")
    .get() as { id: number; credential_version: number } | undefined;
  if (!row) throw new Error("CONFIG_NOT_SAVED");
  db.prepare(`
    UPDATE integration_config SET disabled_at = ?, status = ?, safe_status_code = ?, verified_at = NULL,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(
    enabled ? null : new Date().toISOString(),
    enabled && row.credential_version > 0 ? "saved" : "action_required",
    enabled ? "VERIFICATION_REQUIRED" : "DISABLED",
    row.id,
  );
}

export function revokePlatformMicrosoftConfig() {
  return revokeIntegrationProvider(platformSession(), "microsoft_platform");
}

export function platformResendSnapshot() {
  const row = db.prepare(`
    SELECT ic.*, cv.fingerprint, cv.last_four
    FROM integration_config ic
    LEFT JOIN integration_credential_version cv ON cv.config_id = ic.id AND cv.is_active = 1
    WHERE ic.provider = 'resend_platform' AND ic.company_id IS NULL
  `).get() as ConfigRow | undefined;
  const counts = db.prepare(`
    SELECT status, COUNT(*) AS count FROM outbox_job
    WHERE kind IN ('invitation_email','password_reset_email','operational_notification_email')
    GROUP BY status
  `).all() as Array<{ status: string; count: number }>;
  const delivery = Object.fromEntries(counts.map(item => [item.status, item.count]));
  const recent = db.prepare(`
    SELECT id, kind, status, recipient_domain, attempts, max_attempts, failure_kind,
      last_error_code, last_http_status, next_attempt_at, expires_at, updated_at,
      CASE WHEN expires_at IS NOT NULL AND julianday(expires_at) > julianday('now') THEN 1 ELSE 0 END AS retryable
    FROM outbox_job
    WHERE kind IN ('invitation_email','password_reset_email','operational_notification_email')
    ORDER BY id DESC LIMIT 20
  `).all() as Array<{
    id: number;
    kind: string;
    status: string;
    recipient_domain: string | null;
    attempts: number;
    max_attempts: number;
    failure_kind: string | null;
    last_error_code: string | null;
    last_http_status: number | null;
    next_attempt_at: string;
    expires_at: string | null;
    updated_at: string;
    retryable: number;
  }>;
  return {
    provider: "resend_platform" as const,
    status: row?.status ?? "not_started",
    safeStatusCode: row?.safe_status_code ?? null,
    environment: row?.environment ?? "production",
    config: row ? parseJson(row.non_secret_json) : {},
    credential: row?.fingerprint ? {
      configured: true,
      fingerprint: row.fingerprint,
      lastFour: row.last_four,
      version: row.credential_version,
    } : { configured: false, fingerprint: null, lastFour: null, version: 0 },
    savedAt: row?.saved_at ?? null,
    verifiedAt: row?.verified_at ?? null,
    disabledAt: row?.disabled_at ?? null,
    validation: latestValidationDetails(row?.id, "validate"),
    delivery: {
      pending: delivery.pending ?? 0,
      running: delivery.running ?? 0,
      retry: delivery.retry ?? 0,
      completed: delivery.completed ?? 0,
      dead: delivery.dead ?? 0,
      cancelled: delivery.cancelled ?? 0,
    },
    recent: recent.map(item => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      recipientDomain: item.recipient_domain,
      attempts: item.attempts,
      maxAttempts: item.max_attempts,
      failureKind: item.failure_kind,
      lastErrorCode: item.last_error_code,
      lastHttpStatus: item.last_http_status,
      nextAttemptAt: item.next_attempt_at,
      expiresAt: item.expires_at,
      updatedAt: item.updated_at,
      retryable: item.retryable === 1,
    })),
  };
}

export function savePlatformResendConfig(input: {
  environment: "test" | "production";
  config: Record<string, string>;
  secrets?: Record<string, string>;
}) {
  return saveIntegrationConfig({ ...input, session: platformSession(), provider: "resend_platform" });
}

export function platformResendConfig(requireVerified = false) {
  const saved = configForProvider(platformSession(), "resend_platform");
  if (saved.disabled_at) throw new Error("RESEND_PLATFORM_DISABLED");
  if (requireVerified && saved.status !== "verified") throw new Error("RESEND_PLATFORM_VERIFICATION_REQUIRED");
  return saved;
}

export function setPlatformResendEnabled(enabled: boolean) {
  const row = db.prepare("SELECT id, credential_version FROM integration_config WHERE provider = 'resend_platform' AND company_id IS NULL")
    .get() as { id: number; credential_version: number } | undefined;
  if (!row) throw new Error("CONFIG_NOT_SAVED");
  db.prepare(`
    UPDATE integration_config SET disabled_at = ?, status = ?, safe_status_code = ?, verified_at = NULL,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(
    enabled ? null : new Date().toISOString(),
    enabled && row.credential_version > 0 ? "saved" : "action_required",
    enabled ? "VERIFICATION_REQUIRED" : "DISABLED",
    row.id,
  );
}

export function revokePlatformResendConfig() {
  return revokeIntegrationProvider(platformSession(), "resend_platform");
}

export function markPlatformResendDeliveryFailure(configId: number, code: string) {
  if (!["RESEND_CREDENTIAL_REJECTED", "RESEND_DOMAIN_NOT_VERIFIED", "RESEND_SENDER_REJECTED"].includes(code)) return;
  db.prepare(`
    UPDATE integration_config SET status = 'action_required', safe_status_code = ?, verified_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND provider = 'resend_platform'
  `).run(code, configId);
}

export function createPlatformOauthState(actor: Actor, configId: number, provider: "google" | "microsoft" = "google") {
  if (!actor.isPlatformAdmin || actor.contextType !== "platform") throw new Error("PLATFORM_ADMIN_REQUIRED");
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const context = `platform-oauth:${actor.sessionId}:${provider}`;
  db.prepare(`
    INSERT INTO platform_integration_oauth_state (
      auth_session_id, identity_id, config_id, state_hash, encrypted_context, expires_at, provider
    ) VALUES (?, ?, ?, ?, ?, datetime('now', '+10 minutes'), ?)
  `).run(actor.sessionId, actor.identityId, configId, sha256(state), encryptIntegrationSecret({ verifier }, context), provider);
  return { state, challenge };
}

export function consumePlatformOauthState(rawState: string, actor: Actor | null, provider: "google" | "microsoft" = "google") {
  if (!actor?.isPlatformAdmin || actor.contextType !== "platform") return null;
  const row = db.prepare(`
    SELECT id, config_id, encrypted_context FROM platform_integration_oauth_state
    WHERE state_hash = ? AND auth_session_id = ? AND identity_id = ? AND provider = ?
      AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
  `).get(sha256(rawState), actor.sessionId, actor.identityId, provider) as {
    id: number;
    config_id: number;
    encrypted_context: string;
  } | undefined;
  if (!row) return null;
  const used = db.prepare("UPDATE platform_integration_oauth_state SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL").run(row.id);
  if (used.changes !== 1) return null;
  const context = decryptIntegrationSecret(row.encrypted_context, `platform-oauth:${actor.sessionId}:${provider}`);
  return { configId: row.config_id, verifier: context.verifier };
}

export function createOauthState(input: { session: IntegrationSession; configId: number; provider: "google" | "microsoft" }) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const encrypted = encryptIntegrationSecret({ verifier }, `oauth:${input.session.sessionId}:${input.provider}`);
  db.prepare(`
    INSERT INTO integration_oauth_state (session_id, config_id, provider, state_hash, encrypted_context, expires_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', '+10 minutes'))
  `).run(input.session.sessionId, input.configId, input.provider, sha256(state), encrypted);
  return { state, challenge };
}

export function consumeOauthState(rawState: string, rawSessionToken: string | undefined, provider: "google" | "microsoft") {
  const session = integrationSession(rawSessionToken);
  if (!session || session.access_kind !== "workshop") return null;
  const row = db.prepare(`
    SELECT id, config_id, encrypted_context FROM integration_oauth_state
    WHERE state_hash = ? AND session_id = ? AND provider = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
  `).get(sha256(rawState), session.sessionId, provider) as { id: number; config_id: number; encrypted_context: string } | undefined;
  if (!row) return null;
  db.prepare("UPDATE integration_oauth_state SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL").run(row.id);
  const context = decryptIntegrationSecret(row.encrypted_context, `oauth:${session.sessionId}:${provider}`);
  return { session, configId: row.config_id, verifier: context.verifier };
}

export function revokeIntegrationProvider(session: IntegrationSession, provider: IntegrationProvider) {
  if (!providerAllowed(session, provider)) throw new Error("PROVIDER_SCOPE_FORBIDDEN");
  const companyId = provider === "microsoft_company" ? session.company_id : null;
  const config = db.prepare(`SELECT id FROM integration_config WHERE provider = ? AND company_id IS ?`)
    .get(provider, companyId) as { id: number } | undefined;
  if (!config) throw new Error("CONFIG_NOT_SAVED");
  db.transaction(() => {
    db.prepare("UPDATE integration_credential_version SET is_active = 0, retired_at = CURRENT_TIMESTAMP WHERE config_id = ? AND is_active = 1").run(config.id);
    db.prepare(`
      UPDATE integration_config SET credential_version = 0, status = 'not_started', safe_status_code = NULL,
        verified_at = NULL, saved_at = NULL, disabled_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(config.id);
  })();
}

export function completeIntegrationWorkshop(session: IntegrationSession) {
  const snapshot = integrationSnapshot(session);
  if (!snapshot.canComplete) throw new Error("VERIFICATION_REQUIRED");
  db.prepare(`
    UPDATE integration_setup_invitation SET completed_at = CURRENT_TIMESTAMP
    WHERE id = ? OR (
      access_kind = 'review' AND scope_kind = ? AND company_id IS ?
      AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    )
  `).run(session.id, session.scope_kind, session.company_id);
  session.completed_at = new Date().toISOString();
}
