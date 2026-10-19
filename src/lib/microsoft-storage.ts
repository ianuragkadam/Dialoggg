import "server-only";

import { createHash, randomBytes } from "node:crypto";

import db from "@/db";
import type { Actor } from "@/lib/auth";
import { canViewProject, isProjectAssigned } from "@/lib/authorization";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "@/lib/integration-crypto";
import { platformMicrosoftConfig, platformMicrosoftSnapshot } from "@/lib/integration-setup";
import {
  exchangeMicrosoftAuthorization,
  integrationProviderIsFake,
  IntegrationProviderError,
  MICROSOFT_GRAPH_SCOPE,
  refreshMicrosoftAccessToken,
  requireMicrosoftScope,
} from "@/lib/integration-providers";
import { sha256 } from "@/lib/security";

export type MicrosoftFailureKind = "authorization" | "permission" | "missing" | "transient" | "permanent";

export class MicrosoftStorageError extends Error {
  constructor(public readonly code: string, public readonly kind: MicrosoftFailureKind, public readonly status = 400) {
    super(code);
  }
}

type ConnectionRow = {
  id: number;
  company_id: number;
  connected_by_membership_id: number | null;
  tenant_id_ciphertext: string;
  account_id_ciphertext: string | null;
  site_id_ciphertext: string | null;
  drive_id_ciphertext: string;
  root_item_id_ciphertext: string;
  token_ciphertext: string;
  token_key_version: number;
  service_type: "onedrive_business" | "sharepoint";
  display_metadata_json: string;
  state: "healthy" | "connection_required" | "permission_denied" | "error" | "disconnected";
  granted_scope: string;
  token_expires_at: string | null;
  root_display_name: string | null;
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_error_code: string | null;
  disconnected_at: string | null;
};

type GraphItem = {
  id: string;
  name?: string;
  displayName?: string;
  webUrl?: string;
  driveType?: string;
  folder?: Record<string, unknown>;
  parentReference?: { driveId?: string; path?: string };
  value?: GraphItem[];
};

function requireCompany(actor: Actor) {
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !actor.companyRole) {
    throw new MicrosoftStorageError("COMPANY_CONTEXT_REQUIRED", "permanent", 403);
  }
}

function requireManager(actor: Actor) {
  requireCompany(actor);
  if (!['owner', 'admin'].includes(actor.companyRole || "")) {
    throw new MicrosoftStorageError("MICROSOFT_MANAGER_REQUIRED", "permanent", 403);
  }
}

function connectionFor(companyId: number) {
  return db.prepare("SELECT * FROM microsoft_connection WHERE company_id = ?").get(companyId) as ConnectionRow | undefined;
}

function connectionContext(connectionId: number, version: number, field: string) {
  return `microsoft-connection:${connectionId}:v${version}:${field}`;
}

function folderContext(mappingId: number, version: number, field: string) {
  return `microsoft-folder:${mappingId}:v${version}:${field}`;
}

function seal(value: string, context: string) {
  return encryptIntegrationSecret({ value }, context);
}

function unseal(value: string | null, context: string) {
  if (!value) return null;
  return decryptIntegrationSecret(value, context).value || null;
}

function parseMetadata(value: string) {
  try { return JSON.parse(value) as Record<string, string>; } catch { return {}; }
}

function fakeItemName(id: string) {
  if (id.startsWith("fake-item-")) {
    try { return decodeURIComponent(id.slice("fake-item-".length)).split("/").at(-1) || "Microsoft folder"; } catch {}
  }
  return id === "fake-root" ? "Projects" : "Microsoft folder";
}

const fakeFolderChildren = new Map<string, GraphItem[]>();
function fakeChildren(parentId: string) {
  let children = fakeFolderChildren.get(parentId);
  if (!children && parentId === "fake-root") {
    children = ["Projects", "Active Projects", "Linked Existing Folder"].map(name => ({
      id: `fake-item-${encodeURIComponent(name)}`, name, webUrl: `https://microsoft.example.test/folders/${encodeURIComponent(name)}`,
      folder: {}, parentReference: { driveId: "fake-drive" },
    }));
    fakeFolderChildren.set(parentId, children);
  }
  return children || [];
}

async function graphRequest(path: string, accessToken: string, init: RequestInit = {}): Promise<GraphItem> {
  if (integrationProviderIsFake()) {
    const failure = process.env.MICROSOFT_FAKE_FAILURE;
    if (failure === "revoked") throw new MicrosoftStorageError("MICROSOFT_AUTHORIZATION_REVOKED", "authorization", 401);
    if (failure === "permission") throw new MicrosoftStorageError("MICROSOFT_PERMISSION_MISSING", "permission", 403);
    if (failure === "outage") throw new MicrosoftStorageError("MICROSOFT_PROVIDER_UNAVAILABLE", "transient", 503);
    if (failure === "missing" && path.includes("/items/")) throw new MicrosoftStorageError("MICROSOFT_FOLDER_MISSING", "missing", 404);
    if (path === "/me") return { id: "fake-account", name: "Fake Microsoft Administrator" };
    if (path === "/me/drive" || path.includes("/drive") && !path.includes("/root") && !path.includes("/items")) {
      return { id: path.includes("/sites/") ? "fake-sharepoint-drive" : "fake-drive", name: path.includes("/sites/") ? "Projects" : "OneDrive", driveType: "business" };
    }
    if (path.startsWith("/sites/")) return { id: "fake-site", name: "Operations" };
    if (path.includes("/children") && init.method === "POST") {
      const body = typeof init.body === "string" ? JSON.parse(init.body) as { name?: string } : {};
      const name = String(body.name || "Dialoggg folder");
      const parentId = decodeURIComponent(path.match(/\/items\/([^/?]+)\/children/)?.[1] || "fake-root");
      const current = fakeChildren(parentId).find(item => item.name?.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (current) return current;
      const id = `fake-item-${encodeURIComponent(`${fakeItemName(parentId)}/${name}`)}`;
      const item = { id, name, webUrl: `https://microsoft.example.test/folders/${encodeURIComponent(name)}`, folder: {}, parentReference: { driveId: "fake-drive" } };
      fakeChildren(parentId).push(item);
      if (!fakeFolderChildren.has(id)) {
        fakeFolderChildren.set(id, name === "Common" || name === "Private" ? [] : [{
          id: `fake-item-${encodeURIComponent(`${name}/Linked Existing Folder`)}`, name: "Linked Existing Folder",
          webUrl: "https://microsoft.example.test/folders/Linked%20Existing%20Folder", folder: {}, parentReference: { driveId: "fake-drive" },
        }]);
      }
      return item;
    }
    if (path.includes("/children")) {
      const parentId = decodeURIComponent(path.match(/\/items\/([^/?]+)\/children/)?.[1] || "fake-root");
      return { id: "children", value: fakeChildren(parentId) };
    }
    const itemId = decodeURIComponent(path.match(/\/items\/([^/?]+)/)?.[1] || "fake-root");
    const name = fakeItemName(itemId);
    return { id: itemId, name, webUrl: `https://microsoft.example.test/folders/${encodeURIComponent(name)}`, folder: {}, parentReference: { driveId: path.includes("fake-sharepoint-drive") ? "fake-sharepoint-drive" : "fake-drive" } };
  }

  let response: Response;
  try {
    response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...init,
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...(init.headers || {}) },
      cache: "no-store",
    });
  } catch {
    throw new MicrosoftStorageError("MICROSOFT_PROVIDER_UNAVAILABLE", "transient", 503);
  }
  let data: GraphItem = { id: "" };
  if (response.status !== 204) {
    try { data = await response.json() as GraphItem; } catch { data = { id: "" }; }
  }
  if (!response.ok) {
    if (response.status === 401) throw new MicrosoftStorageError("MICROSOFT_AUTHORIZATION_REVOKED", "authorization", 401);
    if (response.status === 403) throw new MicrosoftStorageError("MICROSOFT_PERMISSION_MISSING", "permission", 403);
    if (response.status === 404) throw new MicrosoftStorageError("MICROSOFT_FOLDER_MISSING", "missing", 404);
    if (response.status === 429 || response.status >= 500) throw new MicrosoftStorageError(`MICROSOFT_PROVIDER_${response.status}`, "transient", response.status);
    throw new MicrosoftStorageError(`MICROSOFT_GRAPH_${response.status}`, "permanent", response.status);
  }
  return data;
}

function mapProviderError(error: unknown) {
  if (error instanceof MicrosoftStorageError) return error;
  if (error instanceof IntegrationProviderError) {
    const kind: MicrosoftFailureKind = error.code === "PROVIDER_UNREACHABLE" ? "transient"
      : error.code.includes("SCOPE") || error.code.includes("PERMISSION") ? "permission" : "authorization";
    return new MicrosoftStorageError(error.code, kind, kind === "transient" ? 503 : 400);
  }
  return new MicrosoftStorageError("MICROSOFT_STORAGE_FAILED", "transient", 503);
}

function markConnectionFailure(connection: ConnectionRow | undefined, error: MicrosoftStorageError) {
  if (!connection) return;
  const state = error.kind === "authorization" ? "connection_required" : error.kind === "permission" ? "permission_denied" : "error";
  db.prepare(`UPDATE microsoft_connection SET state = ?, last_attempt_at = CURRENT_TIMESTAMP,
    last_error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(state, error.code.slice(0, 120), connection.id);
  if (error.kind === "authorization" || error.kind === "permission") {
    db.prepare("UPDATE project_folder_mapping SET state = ?, last_error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE connection_id = ?")
      .run(error.kind === "permission" ? "permission_denied" : "connection_required", error.code.slice(0, 120), connection.id);
  }
}

async function accessFor(connection: ConnectionRow) {
  let refreshToken: string;
  try {
    refreshToken = decryptIntegrationSecret(connection.token_ciphertext, connectionContext(connection.id, connection.token_key_version, "token")).refreshToken;
  } catch {
    const error = new MicrosoftStorageError("MICROSOFT_RECONNECT_REQUIRED", "authorization", 401);
    markConnectionFailure(connection, error);
    throw error;
  }
  if (!refreshToken) throw new MicrosoftStorageError("MICROSOFT_RECONNECT_REQUIRED", "authorization", 401);
  try {
    const platform = platformMicrosoftConfig(true);
    const refreshed = await refreshMicrosoftAccessToken(refreshToken, platform.config, platform.secrets);
    if (refreshed.refreshToken) {
      db.prepare("UPDATE microsoft_connection SET token_ciphertext = ?, token_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(encryptIntegrationSecret({ refreshToken: refreshed.refreshToken }, connectionContext(connection.id, connection.token_key_version, "token")), new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(), connection.id);
    }
    return refreshed.accessToken;
  } catch (error) {
    const domain = mapProviderError(error);
    markConnectionFailure(connection, domain);
    throw domain;
  }
}

export function createMicrosoftOauthState(actor: Actor, input: { serviceType: "onedrive_business" | "sharepoint"; sharepointHost?: string; sharepointPath?: string }) {
  requireManager(actor);
  const platform = platformMicrosoftConfig(true);
  if (input.serviceType === "sharepoint" && (!input.sharepointHost || !input.sharepointPath)) {
    throw new MicrosoftStorageError("SHAREPOINT_LOCATION_REQUIRED", "permanent", 400);
  }
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const context = `microsoft-oauth:${actor.sessionId}:${actor.identityId}:${actor.companyId}`;
  const encrypted = encryptIntegrationSecret({
    verifier,
    serviceType: input.serviceType,
    sharepointHost: String(input.sharepointHost || "").trim(),
    sharepointPath: String(input.sharepointPath || "").trim().replace(/^\/+|\/+$/g, ""),
  }, context);
  db.prepare(`INSERT INTO microsoft_oauth_state (
    auth_session_id, identity_id, company_id, membership_id, config_id, state_hash, encrypted_context, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+10 minutes'))`).run(
    actor.sessionId, actor.identityId, actor.companyId, actor.membershipId, platform.id, sha256(state), encrypted,
  );
  return { state, challenge, config: platform.config };
}

export function consumeMicrosoftOauthState(rawState: string, actor: Actor | null) {
  if (!actor || actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !['owner', 'admin'].includes(actor.companyRole || "")) return null;
  const row = db.prepare(`SELECT id, config_id, encrypted_context FROM microsoft_oauth_state
    WHERE state_hash = ? AND auth_session_id = ? AND identity_id = ? AND company_id = ? AND membership_id = ?
      AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`).get(
    sha256(rawState), actor.sessionId, actor.identityId, actor.companyId, actor.membershipId,
  ) as { id: number; config_id: number; encrypted_context: string } | undefined;
  if (!row) return null;
  const used = db.prepare("UPDATE microsoft_oauth_state SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL").run(row.id);
  if (used.changes !== 1) return null;
  const details = decryptIntegrationSecret(row.encrypted_context, `microsoft-oauth:${actor.sessionId}:${actor.identityId}:${actor.companyId}`);
  return {
    actor,
    configId: row.config_id,
    verifier: details.verifier,
    serviceType: details.serviceType === "sharepoint" ? "sharepoint" as const : "onedrive_business" as const,
    sharepointHost: details.sharepointHost || "",
    sharepointPath: details.sharepointPath || "",
  };
}

async function discoverTarget(accessToken: string, input: { serviceType: "onedrive_business" | "sharepoint"; sharepointHost?: string; sharepointPath?: string }) {
  if (input.serviceType === "sharepoint") {
    const host = String(input.sharepointHost || "").trim();
    const path = String(input.sharepointPath || "").trim().replace(/^\/+|\/+$/g, "");
    if (!host || !path) throw new MicrosoftStorageError("SHAREPOINT_LOCATION_REQUIRED", "permanent", 400);
    const site = await graphRequest(`/sites/${encodeURIComponent(host)}:/${path.split("/").map(encodeURIComponent).join("/")}`, accessToken);
    const drive = await graphRequest(`/sites/${encodeURIComponent(site.id)}/drive`, accessToken);
    const root = await graphRequest(`/drives/${encodeURIComponent(drive.id)}/root`, accessToken);
    return { site, drive, root };
  }
  const drive = await graphRequest("/me/drive", accessToken);
  const root = await graphRequest(`/drives/${encodeURIComponent(drive.id)}/root`, accessToken);
  return { site: null, drive, root };
}

export async function completeMicrosoftAuthorization(input: {
  actor: Actor;
  code: string;
  verifier: string;
  serviceType: "onedrive_business" | "sharepoint";
  sharepointHost?: string;
  sharepointPath?: string;
}) {
  requireManager(input.actor);
  const platform = platformMicrosoftConfig(true);
  try {
    const tokens = await exchangeMicrosoftAuthorization(input.code, input.verifier, platform.config, platform.secrets);
    requireMicrosoftScope(tokens.scope);
    if (!tokens.refreshToken) throw new MicrosoftStorageError("MICROSOFT_REFRESH_TOKEN_MISSING", "authorization", 400);
    const identity = await graphRequest("/me", tokens.accessToken);
    const target = await discoverTarget(tokens.accessToken, input);
    if (!identity.id || !target.drive.id || !target.root.id) throw new MicrosoftStorageError("MICROSOFT_TARGET_INVALID", "permanent", 502);
    const tenantId = platform.config.tenantId || "organizations";
    const metadata = {
      accountName: identity.displayName || identity.name || "Microsoft account",
      siteName: target.site?.name || "",
      driveName: target.drive.name || (input.serviceType === "sharepoint" ? "Documents" : "OneDrive"),
    };
    let connection = connectionFor(input.actor.companyId!);
    if (!connection) {
      const inserted = db.prepare(`INSERT INTO microsoft_connection (
        company_id, connected_by_membership_id, tenant_id_ciphertext, account_id_ciphertext, site_id_ciphertext,
        drive_id_ciphertext, root_item_id_ciphertext, token_ciphertext, token_key_version, service_type,
        display_metadata_json, state, granted_scope, token_expires_at, root_display_name,
        last_success_at, last_attempt_at, last_error_code, disconnected_at
      ) VALUES (?, ?, 'pending', 'pending', NULL, 'pending', 'pending', 'pending', 1, ?, ?, 'healthy', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL)`)
        .run(input.actor.companyId, input.actor.membershipId, input.serviceType, JSON.stringify(metadata), tokens.scope, new Date(Date.now() + tokens.expiresIn * 1000).toISOString(), target.root.name || "Root");
      connection = connectionFor(input.actor.companyId!)!;
      if (connection.id !== Number(inserted.lastInsertRowid)) throw new MicrosoftStorageError("MICROSOFT_CONNECTION_CREATE_FAILED", "permanent", 500);
    }
    const version = connection.token_key_version + (connection.token_ciphertext === "pending" ? 0 : 1);
    db.prepare(`UPDATE microsoft_connection SET connected_by_membership_id = ?, tenant_id_ciphertext = ?,
      account_id_ciphertext = ?, site_id_ciphertext = ?, drive_id_ciphertext = ?, root_item_id_ciphertext = ?,
      token_ciphertext = ?, token_key_version = ?, service_type = ?, display_metadata_json = ?, state = 'healthy',
      granted_scope = ?, token_expires_at = ?, root_display_name = ?, last_success_at = CURRENT_TIMESTAMP,
      last_attempt_at = CURRENT_TIMESTAMP, last_error_code = NULL, disconnected_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(
      input.actor.membershipId,
      seal(tenantId, connectionContext(connection.id, version, "tenant")),
      seal(identity.id, connectionContext(connection.id, version, "account")),
      target.site?.id ? seal(target.site.id, connectionContext(connection.id, version, "site")) : null,
      seal(target.drive.id, connectionContext(connection.id, version, "drive")),
      seal(target.root.id, connectionContext(connection.id, version, "root")),
      encryptIntegrationSecret({ refreshToken: tokens.refreshToken }, connectionContext(connection.id, version, "token")),
      version, input.serviceType, JSON.stringify(metadata), tokens.scope,
      new Date(Date.now() + tokens.expiresIn * 1000).toISOString(), target.root.name || "Root", connection.id,
    );
    db.prepare("UPDATE project_folder_mapping SET connection_id = ?, state = 'healthy', last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE project_id IN (SELECT id FROM project WHERE company_id = ?)")
      .run(connection.id, input.actor.companyId);
    return { connectionId: connection.id };
  } catch (error) {
    const domain = mapProviderError(error);
    markConnectionFailure(connectionFor(input.actor.companyId!), domain);
    throw domain;
  }
}

export function microsoftConnectionSnapshot(actor: Actor) {
  requireManager(actor);
  const connection = connectionFor(actor.companyId!);
  const platform = platformMicrosoftSnapshot();
  const metadata = connection ? parseMetadata(connection.display_metadata_json) : {};
  return {
    state: connection?.state ?? "connection_required",
    serviceType: connection?.service_type ?? null,
    display: connection ? {
      accountName: metadata.accountName || "Microsoft account",
      siteName: metadata.siteName || null,
      driveName: metadata.driveName || "Microsoft storage",
      rootName: connection.root_display_name || "Root",
    } : null,
    grantedScope: connection?.granted_scope ? MICROSOFT_GRAPH_SCOPE : null,
    lastSuccessAt: connection?.last_success_at ?? null,
    lastAttemptAt: connection?.last_attempt_at ?? null,
    lastErrorCode: connection?.last_error_code ?? null,
    platform: {
      configured: platform.credential.configured,
      status: platform.status,
      safeStatusCode: platform.safeStatusCode,
      disabled: !!platform.disabledAt,
    },
  };
}

function choiceContext(companyId: number, connectionId: number, purpose: "root" | "folder") {
  return `microsoft-choice:${companyId}:${connectionId}:${purpose}`;
}

function encodeChoice(companyId: number, connectionId: number, purpose: "root" | "folder", driveId: string, item: GraphItem) {
  return encryptIntegrationSecret({
    companyId: String(companyId), connectionId: String(connectionId), driveId, itemId: item.id,
    issuedAt: String(Date.now()), name: String(item.name || "Microsoft folder"),
  }, choiceContext(companyId, connectionId, purpose));
}

function decodeChoice(companyId: number, connection: ConnectionRow, purpose: "root" | "folder", value: string) {
  let decoded: Record<string, string>;
  try { decoded = decryptIntegrationSecret(value, choiceContext(companyId, connection.id, purpose)); }
  catch { throw new MicrosoftStorageError("MICROSOFT_FOLDER_CHOICE_INVALID", "permanent", 400); }
  if (Number(decoded.companyId) !== companyId || Number(decoded.connectionId) !== connection.id || Date.now() - Number(decoded.issuedAt) > 15 * 60_000) {
    throw new MicrosoftStorageError("MICROSOFT_FOLDER_CHOICE_EXPIRED", "permanent", 400);
  }
  return decoded;
}

async function connectionIds(connection: ConnectionRow) {
  try {
    return {
      driveId: unseal(connection.drive_id_ciphertext, connectionContext(connection.id, connection.token_key_version, "drive"))!,
      rootId: unseal(connection.root_item_id_ciphertext, connectionContext(connection.id, connection.token_key_version, "root"))!,
    };
  } catch {
    throw new MicrosoftStorageError("MICROSOFT_RECONNECT_REQUIRED", "authorization", 401);
  }
}

async function listChildren(connection: ConnectionRow, purpose: "root" | "folder") {
  if (connection.state !== "healthy") throw new MicrosoftStorageError("MICROSOFT_CONNECTION_REQUIRED", "authorization", 409);
  const accessToken = await accessFor(connection);
  const { driveId, rootId } = await connectionIds(connection);
  const current = await graphRequest(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(rootId)}`, accessToken);
  const children = await graphRequest(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(rootId)}/children?$select=id,name,webUrl,folder,parentReference`, accessToken);
  const folders = [current, ...(children.value || []).filter(item => !!item.folder)];
  return folders.map(item => ({ choice: encodeChoice(connection.company_id, connection.id, purpose, driveId, item), name: item.name || "Microsoft folder" }));
}

async function childrenAt(connection: ConnectionRow, driveId: string, parentId: string, accessToken: string) {
  return graphRequest(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children?$select=id,name,webUrl,folder,parentReference`, accessToken);
}

export async function listMicrosoftRootChoices(actor: Actor) {
  requireManager(actor);
  const connection = connectionFor(actor.companyId!);
  if (!connection) throw new MicrosoftStorageError("MICROSOFT_CONNECTION_REQUIRED", "authorization", 409);
  try { return await listChildren(connection, "root"); }
  catch (error) { const domain = mapProviderError(error); markConnectionFailure(connection, domain); throw domain; }
}

export async function selectMicrosoftRoot(actor: Actor, choice: string) {
  requireManager(actor);
  const connection = connectionFor(actor.companyId!);
  if (!connection) throw new MicrosoftStorageError("MICROSOFT_CONNECTION_REQUIRED", "authorization", 409);
  const decoded = decodeChoice(actor.companyId!, connection, "root", choice);
  const accessToken = await accessFor(connection);
  const item = await graphRequest(`/drives/${encodeURIComponent(decoded.driveId)}/items/${encodeURIComponent(decoded.itemId)}`, accessToken);
  if (!item.folder) throw new MicrosoftStorageError("MICROSOFT_ROOT_NOT_FOLDER", "permanent", 400);
  db.prepare(`UPDATE microsoft_connection SET drive_id_ciphertext = ?, root_item_id_ciphertext = ?, root_display_name = ?,
    state = 'healthy', last_success_at = CURRENT_TIMESTAMP, last_attempt_at = CURRENT_TIMESTAMP,
    last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
    seal(decoded.driveId, connectionContext(connection.id, connection.token_key_version, "drive")),
    seal(decoded.itemId, connectionContext(connection.id, connection.token_key_version, "root")),
    item.name || decoded.name || "Root", connection.id,
  );
  return microsoftConnectionSnapshot(actor);
}

export function disconnectMicrosoft(actor: Actor) {
  requireManager(actor);
  const connection = connectionFor(actor.companyId!);
  if (!connection) return microsoftConnectionSnapshot(actor);
  db.transaction(() => {
    db.prepare(`UPDATE microsoft_connection SET state = 'disconnected', token_ciphertext = 'revoked',
      disconnected_at = CURRENT_TIMESTAMP, last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(connection.id);
    db.prepare(`UPDATE project_folder_mapping SET state = 'connection_required', last_error_code = 'MICROSOFT_CONNECTION_REQUIRED',
      updated_at = CURRENT_TIMESTAMP WHERE connection_id = ?`).run(connection.id);
  })();
  return microsoftConnectionSnapshot(actor);
}

export async function retryMicrosoftConnection(actor: Actor) {
  requireManager(actor);
  const connection = connectionFor(actor.companyId!);
  if (!connection || connection.state === "disconnected") throw new MicrosoftStorageError("MICROSOFT_RECONNECT_REQUIRED", "authorization", 409);
  try {
    const accessToken = await accessFor(connection);
    const { driveId, rootId } = await connectionIds(connection);
    const root = await graphRequest(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(rootId)}`, accessToken);
    db.prepare(`UPDATE microsoft_connection SET state = 'healthy', root_display_name = ?, last_success_at = CURRENT_TIMESTAMP,
      last_attempt_at = CURRENT_TIMESTAMP, last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(root.name || connection.root_display_name || "Root", connection.id);
    return microsoftConnectionSnapshot(actor);
  } catch (error) { const domain = mapProviderError(error); markConnectionFailure(connection, domain); throw domain; }
}

function projectFor(actor: Actor, projectId: number) {
  requireCompany(actor);
  if (!canViewProject(actor, projectId)) return null;
  return db.prepare("SELECT id, company_id, name, status FROM project WHERE id = ? AND company_id = ?")
    .get(projectId, actor.companyId) as { id: number; company_id: number; name: string; status: string } | undefined;
}

function folderEligibility(actor: Actor, projectId: number) {
  const manager = actor.companyRole === "owner" || actor.companyRole === "admin";
  const assigned = isProjectAssigned(projectId, actor.membershipId);
  return { manager, assigned, common: manager || assigned, private: manager };
}

export function projectFoldersSnapshot(actor: Actor, projectId: number) {
  const project = projectFor(actor, projectId);
  if (!project) throw new MicrosoftStorageError("PROJECT_NOT_FOUND", "permanent", 404);
  const eligibility = folderEligibility(actor, projectId);
  const connection = connectionFor(project.company_id);
  const rows = connection ? db.prepare(`SELECT kind, display_name, state, last_verified_at, last_error_code
    FROM project_folder_mapping WHERE project_id = ? AND connection_id = ? ORDER BY kind`).all(projectId, connection.id) as Array<{
      kind: "common" | "private"; display_name: string | null; state: string; last_verified_at: string | null; last_error_code: string | null;
    }> : [];
  const safeRows = rows.filter(row => row.kind === "common" ? eligibility.common : eligibility.private).map(row => ({
    kind: row.kind,
    displayName: row.display_name || `${project.name} — ${row.kind === "common" ? "Common" : "Private"}`,
    state: connection?.state === "healthy" ? row.state : "connection_required",
    lastVerifiedAt: row.last_verified_at,
    lastErrorCode: row.last_error_code,
    canOpen: connection?.state === "healthy" && row.state === "healthy",
  }));
  return {
    project: { id: project.id, name: project.name, status: project.status },
    connectionState: connection?.state ?? "connection_required",
    rootDisplayName: connection?.root_display_name ?? null,
    commonVisible: eligibility.common,
    privateVisible: eligibility.private,
    canEdit: eligibility.manager && project.status === "active" && connection?.state === "healthy",
    folders: safeRows,
  };
}

// Resolve visible folder locations from Microsoft rather than guessing where a linked
// or subsequently moved folder lives. This also makes missing folders visible on load.
export async function projectFoldersSnapshotLive(actor: Actor, projectId: number) {
  const snapshot = projectFoldersSnapshot(actor, projectId);
  const connection = connectionFor(actor.companyId!);
  if (!connection || connection.state !== "healthy" || !snapshot.folders.length) return snapshot;
  let accessToken: string;
  try { accessToken = await accessFor(connection); }
  catch { return projectFoldersSnapshot(actor, projectId); }
  const folders = await Promise.all(snapshot.folders.map(async folder => {
    const mapping = mappingFor(projectId, folder.kind, connection.id);
    if (!mapping) return folder;
    try {
      const driveId = unseal(mapping.drive_id_ciphertext, folderContext(mapping.id, mapping.token_key_version, "drive"));
      const itemId = unseal(mapping.item_id_ciphertext, folderContext(mapping.id, mapping.token_key_version, "item"));
      if (!driveId || !itemId) return folder;
      const item = await graphRequest(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,webUrl,folder,parentReference`, accessToken);
      if (!item.folder) throw new MicrosoftStorageError("MICROSOFT_FOLDER_MISSING", "missing", 404);
      const name = item.name || folder.displayName;
      const parent = item.parentReference?.path?.split("root:").at(-1)?.split("/").filter(Boolean).map(decodeURIComponent) || [];
      const location = parent.length ? [...parent, name].join(" › ") : [snapshot.rootDisplayName, snapshot.project.name, name].filter(Boolean).join(" › ");
      db.prepare("UPDATE project_folder_mapping SET display_name = ?, state = 'healthy', last_verified_at = CURRENT_TIMESTAMP, last_error_code = NULL WHERE id = ?")
        .run(name, mapping.id);
      return { ...folder, displayName: name, location, state: "healthy", canOpen: true };
    } catch (error) {
      const domain = mapProviderError(error);
      const state = domain.kind === "missing" ? "missing" : domain.kind === "permission" ? "permission_denied" : domain.kind === "authorization" ? "connection_required" : "error";
      db.prepare("UPDATE project_folder_mapping SET state = ?, last_error_code = ? WHERE id = ?").run(state, domain.code.slice(0, 120), mapping.id);
      return { ...folder, state, canOpen: false };
    }
  }));
  return { ...snapshot, folders };
}

function requireFolderManager(actor: Actor, projectId: number) {
  requireManager(actor);
  const project = projectFor(actor, projectId);
  if (!project) throw new MicrosoftStorageError("PROJECT_NOT_FOUND", "permanent", 404);
  if (project.status !== "active") throw new MicrosoftStorageError("PROJECT_READ_ONLY", "permanent", 409);
  const connection = connectionFor(project.company_id);
  if (!connection || connection.state !== "healthy") throw new MicrosoftStorageError("MICROSOFT_CONNECTION_REQUIRED", "authorization", 409);
  return { project, connection };
}

export async function listProjectFolderChoices(actor: Actor, projectId: number) {
  const { connection, project } = requireFolderManager(actor, projectId);
  const accessToken = await accessFor(connection);
  const { driveId, rootId } = await connectionIds(connection);
  const rootChildren = await childrenAt(connection, driveId, rootId, accessToken);
  const projectFolder = (rootChildren.value || []).find(item => item.folder && item.name?.toLocaleLowerCase() === project.name.toLocaleLowerCase());
  if (!projectFolder) return [];
  const projectChildren = await childrenAt(connection, driveId, projectFolder.id, accessToken);
  return (projectChildren.value || []).filter(item => !!item.folder).map(item => ({
    choice: encodeChoice(connection.company_id, connection.id, "folder", driveId, item),
    name: item.name || "Microsoft folder",
  }));
}

async function createFolder(connection: ConnectionRow, projectName: string, kind: "common" | "private") {
  const accessToken = await accessFor(connection);
  const { driveId, rootId } = await connectionIds(connection);
  const ensureFolder = async (parentId: string, name: string) => {
    const children = await childrenAt(connection, driveId, parentId, accessToken);
    const existing = (children.value || []).find(item => item.folder && item.name?.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) return existing;
    const item = await graphRequest(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children`, accessToken, {
      method: "POST",
      body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    if (!item.id || !item.folder) throw new MicrosoftStorageError("MICROSOFT_FOLDER_CREATE_FAILED", "permanent", 502);
    return item;
  };
  const projectFolder = await ensureFolder(rootId, projectName);
  const name = kind === "common" ? "Common" : "Private";
  const folder = await ensureFolder(projectFolder.id, name);
  return { driveId, item: folder };
}

export async function autoCreateProjectFolders(actor: Actor, projectId: number) {
  const project = projectFor(actor, projectId);
  if (!project) return { status: "skipped" as const, reason: "project_unavailable" as const };
  const connection = connectionFor(project.company_id);
  if (!connection || connection.state !== "healthy") {
    return { status: "skipped" as const, reason: "microsoft_storage_not_connected" as const };
  }

  const created: Array<"common" | "private"> = [];
  const failed: Array<{ kind: "common" | "private"; code: string }> = [];
  for (const kind of ["common", "private"] as const) {
    try {
      await configureProjectFolder(actor, projectId, { kind, method: "create" });
      created.push(kind);
    } catch (error) {
      const domain = error instanceof MicrosoftStorageError ? error : mapProviderError(error);
      failed.push({ kind, code: domain.code });
    }
  }
  return {
    status: failed.length === 0 ? "created" as const : created.length ? "partial" as const : "failed" as const,
    created,
    failed,
  };
}

export async function configureProjectFolder(actor: Actor, projectId: number, input: { kind: "common" | "private"; method: "create" | "link"; choice?: string }) {
  const { project, connection } = requireFolderManager(actor, projectId);
  let driveId: string;
  let item: GraphItem;
  try {
    if (input.method === "create") ({ driveId, item } = await createFolder(connection, project.name, input.kind));
    else {
      if (!input.choice) throw new MicrosoftStorageError("MICROSOFT_FOLDER_CHOICE_REQUIRED", "permanent", 400);
      const decoded = decodeChoice(project.company_id, connection, "folder", input.choice);
      driveId = decoded.driveId;
      const accessToken = await accessFor(connection);
      item = await graphRequest(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(decoded.itemId)}`, accessToken);
      if (!item.folder) throw new MicrosoftStorageError("MICROSOFT_ITEM_NOT_FOLDER", "permanent", 400);
    }
    db.prepare(`INSERT INTO project_folder_mapping (
      project_id, connection_id, kind, drive_id_ciphertext, item_id_ciphertext, web_url_ciphertext,
      display_name, state, token_key_version, last_verified_at, last_error_code
    ) VALUES (?, ?, ?, 'pending', 'pending', NULL, ?, 'healthy', 1, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT(project_id, kind) DO NOTHING`).run(projectId, connection.id, input.kind, item.name || `${project.name} — ${input.kind}`);
    const mapping = db.prepare("SELECT id, token_key_version FROM project_folder_mapping WHERE project_id = ? AND kind = ?")
      .get(projectId, input.kind) as { id: number; token_key_version: number };
    const version = mapping.token_key_version + 1;
    db.prepare(`UPDATE project_folder_mapping SET connection_id = ?, drive_id_ciphertext = ?, item_id_ciphertext = ?,
      web_url_ciphertext = ?, display_name = ?, state = 'healthy', token_key_version = ?, last_verified_at = CURRENT_TIMESTAMP,
      last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
      connection.id,
      seal(driveId, folderContext(mapping.id, version, "drive")),
      seal(item.id, folderContext(mapping.id, version, "item")),
      item.webUrl ? seal(item.webUrl, folderContext(mapping.id, version, "url")) : null,
      item.name || `${project.name} — ${input.kind}`, version, mapping.id,
    );
    return projectFoldersSnapshot(actor, projectId);
  } catch (error) { const domain = mapProviderError(error); markConnectionFailure(connection, domain); throw domain; }
}

function mappingFor(projectId: number, kind: "common" | "private", connectionId: number) {
  return db.prepare("SELECT * FROM project_folder_mapping WHERE project_id = ? AND kind = ? AND connection_id = ?")
    .get(projectId, kind, connectionId) as { id: number; drive_id_ciphertext: string; item_id_ciphertext: string; token_key_version: number } | undefined;
}

export async function openProjectFolder(actor: Actor, projectId: number, kind: "common" | "private") {
  const project = projectFor(actor, projectId);
  if (!project) throw new MicrosoftStorageError("PROJECT_NOT_FOUND", "permanent", 404);
  const eligibility = folderEligibility(actor, projectId);
  if ((kind === "common" && !eligibility.common) || (kind === "private" && !eligibility.private)) {
    throw new MicrosoftStorageError("FOLDER_ACCESS_FORBIDDEN", "permanent", 403);
  }
  const connection = connectionFor(project.company_id);
  if (!connection || connection.state !== "healthy") throw new MicrosoftStorageError("MICROSOFT_CONNECTION_REQUIRED", "authorization", 409);
  const mapping = mappingFor(projectId, kind, connection.id);
  if (!mapping) throw new MicrosoftStorageError("MICROSOFT_FOLDER_NOT_CONFIGURED", "missing", 404);
  try {
    const accessToken = await accessFor(connection);
    const driveId = unseal(mapping.drive_id_ciphertext, folderContext(mapping.id, mapping.token_key_version, "drive"));
    const itemId = unseal(mapping.item_id_ciphertext, folderContext(mapping.id, mapping.token_key_version, "item"));
    if (!driveId || !itemId) throw new MicrosoftStorageError("MICROSOFT_FOLDER_REFERENCE_INVALID", "permanent", 500);
    const item = await graphRequest(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, accessToken);
    if (!item.folder || !item.webUrl) throw new MicrosoftStorageError("MICROSOFT_FOLDER_REFERENCE_INVALID", "permanent", 502);
    db.prepare(`UPDATE project_folder_mapping SET display_name = ?, web_url_ciphertext = ?, state = 'healthy',
      last_verified_at = CURRENT_TIMESTAMP, last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
      item.name || "Microsoft folder", seal(item.webUrl, folderContext(mapping.id, mapping.token_key_version, "url")), mapping.id,
    );
    db.prepare("UPDATE microsoft_connection SET state = 'healthy', last_success_at = CURRENT_TIMESTAMP, last_attempt_at = CURRENT_TIMESTAMP, last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(connection.id);
    return { webUrl: item.webUrl, displayName: item.name || "Microsoft folder" };
  } catch (error) {
    const domain = mapProviderError(error);
    const state = domain.kind === "missing" ? "missing" : domain.kind === "permission" ? "permission_denied" : domain.kind === "authorization" ? "connection_required" : "error";
    db.prepare("UPDATE project_folder_mapping SET state = ?, last_error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(state, domain.code.slice(0, 120), mapping.id);
    markConnectionFailure(connection, domain);
    throw domain;
  }
}
