import { randomBytes } from "node:crypto";

import db from "@/db";
import { issueInvitation } from "@/lib/account-tokens";
import { hashPassword, type Actor } from "@/lib/auth";
import { normalizeEmail, recordAudit } from "@/lib/security";

export const FIXED_RESOURCE_CATEGORIES = ["Employee", "Subcontractor", "Supplier", "Equipment", "Other"] as const;

export type CompanyOperationalMetadata = {
  id: number;
  name: string;
  status: "active" | "suspended";
  timeZone: string;
  ownerName: string;
  ownerEmail: string;
  ownerStatus: "pending" | "active" | "deactivated";
  users: number;
  resources: number;
  activeProjects: number;
  createdAt: string;
  expirationDate: string | null;
  googleStatus: "Connected" | "Not connected" | "Attention needed" | "Paused";
  oneDriveStatus: "Connected" | "Not connected" | "Setup pending" | "Attention needed";
};

export type CompanyActivityItem = {
  id: number;
  occurredAt: string;
  actor: string;
  action: string;
  target: string;
  result: "success" | "denied" | "failure";
};

type CompanyRow = {
  id: number;
  name: string;
  status: string;
  time_zone: string;
  signup_date: string;
  expiration_date: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  owner_status: string | null;
  user_count: number;
  resource_count: number;
  active_project_count: number;
  company_google_state: string | null;
  google_connection_count: number;
  google_error_count: number;
  microsoft_state: string | null;
};

const COMPANY_METADATA_SQL = `
  SELECT c.id, c.name, lower(c.status) AS status, c.time_zone, c.signup_date, c.expiration_date,
    owner_identity.first_name AS owner_first_name,
    owner_identity.last_name AS owner_last_name,
    owner_identity.normalized_email AS owner_email,
    owner_membership.status AS owner_status,
    (SELECT COUNT(*) FROM company_membership cm_count
      WHERE cm_count.company_id = c.id AND cm_count.status <> 'deactivated') AS user_count,
    (SELECT COUNT(*) FROM resource r
      WHERE r.company_id = c.id AND lower(COALESCE(r.status, 'active')) = 'active') AS resource_count,
    (SELECT COUNT(*) FROM project p
      WHERE p.company_id = c.id AND lower(COALESCE(p.status, 'active')) = 'active') AS active_project_count,
    company_google.state AS company_google_state,
    (SELECT COUNT(DISTINCT gc.id)
      FROM company_membership cm_google
      JOIN google_connection gc ON gc.identity_id = cm_google.identity_id
        AND gc.company_id = cm_google.company_id AND gc.membership_id = cm_google.id
      WHERE cm_google.company_id = c.id AND cm_google.status = 'active') AS google_connection_count,
    (SELECT COUNT(DISTINCT gc.id)
      FROM company_membership cm_google
      JOIN google_connection gc ON gc.identity_id = cm_google.identity_id
        AND gc.company_id = cm_google.company_id AND gc.membership_id = cm_google.id
      WHERE cm_google.company_id = c.id AND cm_google.status = 'active'
        AND gc.state IN ('action_required', 'connection_required')) AS google_error_count,
    microsoft.state AS microsoft_state
  FROM company c
  LEFT JOIN company_membership owner_membership ON owner_membership.id = (
    SELECT cm_owner.id FROM company_membership cm_owner
    WHERE cm_owner.company_id = c.id AND cm_owner.role = 'owner'
    ORDER BY cm_owner.id LIMIT 1
  )
  LEFT JOIN identity owner_identity ON owner_identity.id = owner_membership.identity_id
  LEFT JOIN company_google_sync_state company_google ON company_google.company_id = c.id
  LEFT JOIN microsoft_connection microsoft ON microsoft.company_id = c.id
`;

function companyStatus(value: string): "active" | "suspended" {
  return value === "suspended" ? "suspended" : "active";
}

function ownerStatus(value: string | null): "pending" | "active" | "deactivated" {
  if (value === "active" || value === "deactivated") return value;
  return "pending";
}

function mapCompany(row: CompanyRow): CompanyOperationalMetadata {
  const googleStatus = row.company_google_state === "paused"
    ? "Paused"
    : row.google_error_count > 0
      ? "Attention needed"
      : row.google_connection_count > 0
        ? "Connected"
        : "Not connected";
  const oneDriveStatus = row.microsoft_state === "healthy"
    ? "Connected"
    : row.microsoft_state === null
      ? "Setup pending"
      : row.microsoft_state === "connection_required" || row.microsoft_state === "disconnected"
        ? "Not connected"
        : "Attention needed";
  return {
    id: row.id,
    name: row.name,
    status: companyStatus(row.status),
    timeZone: row.time_zone,
    ownerName: `${row.owner_first_name ?? "Pending"} ${row.owner_last_name ?? "Owner"}`.trim(),
    ownerEmail: row.owner_email ?? "Invitation pending",
    ownerStatus: ownerStatus(row.owner_status),
    users: Number(row.user_count),
    resources: Number(row.resource_count),
    activeProjects: Number(row.active_project_count),
    createdAt: row.signup_date,
    expirationDate: row.expiration_date,
    googleStatus,
    oneDriveStatus,
  };
}

export function listCompanyOperationalMetadata() {
  const rows = db.prepare(`${COMPANY_METADATA_SQL} ORDER BY lower(c.name), c.id`).all() as CompanyRow[];
  return rows.map(mapCompany);
}

export function getCompanyOperationalMetadata(companyId: number) {
  const row = db.prepare(`${COMPANY_METADATA_SQL} WHERE c.id = ?`).get(companyId) as CompanyRow | undefined;
  return row ? mapCompany(row) : null;
}

export function listCompanyActivity(companyId: number): CompanyActivityItem[] {
  const rows = db.prepare(`
    SELECT a.id, a.occurred_at, a.action, a.target_type, a.target_id, a.result,
      COALESCE(NULLIF(TRIM(i.first_name || ' ' || i.last_name), ''), i.normalized_email, 'System') AS actor
    FROM audit_event a
    LEFT JOIN identity i ON i.id = a.actor_identity_id
    WHERE a.company_id = ?
    ORDER BY a.occurred_at DESC, a.id DESC
    LIMIT 100
  `).all(companyId) as Array<{ id: number; occurred_at: string; action: string; target_type: string | null; target_id: string | null; result: "success" | "denied" | "failure"; actor: string }>;
  return rows.map(row => ({
    id: row.id,
    occurredAt: row.occurred_at,
    actor: row.actor,
    action: row.action,
    target: row.target_type ? `${row.target_type}${row.target_id ? `:${row.target_id}` : ""}` : "—",
    result: row.result,
  }));
}

export function updateCompanyExpiration(companyId: number, expirationDate: string | null) {
  const result = db.prepare("UPDATE company SET expiration_date = ? WHERE id = ?").run(expirationDate, companyId);
  return result.changes === 1 ? getCompanyOperationalMetadata(companyId) : null;
}

export function isIanaTimeZone(value: string) {
  if (!value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function supportedTimeZones() {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  const values = intl.supportedValuesOf?.("timeZone") ?? [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "Pacific/Honolulu",
    "UTC",
  ];
  return values.includes("UTC") ? values : [...values, "UTC"];
}

export type CreateCompanyInput = {
  name: string;
  timeZone: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
};

export function validateCreateCompanyInput(input: CreateCompanyInput) {
  const fields: Record<string, string> = {};
  if (!input.name || input.name.length > 100) fields.companyName = "Enter a Company Name up to 100 characters.";
  if (!isIanaTimeZone(input.timeZone)) fields.timeZone = "Choose a valid IANA time zone.";
  if (!input.ownerFirstName || input.ownerFirstName.length > 80) fields.firstName = "Enter the first Owner's first name.";
  if (!input.ownerLastName || input.ownerLastName.length > 80) fields.lastName = "Enter the first Owner's last name.";
  if (!/^\S+@\S+\.\S+$/.test(input.ownerEmail) || input.ownerEmail.length > 254) fields.ownerEmail = "Enter a valid Owner email address.";
  return fields;
}

export async function createCompanyWithFirstOwner(input: {
  actor: Actor;
  requestId: string;
  baseUrl: string;
  company: CreateCompanyInput;
}) {
  const normalizedEmail = normalizeEmail(input.company.ownerEmail);
  const existingIdentity = db.prepare(`
    SELECT id, status FROM identity WHERE normalized_email = ?
  `).get(normalizedEmail) as { id: number; status: string } | undefined;
  if (existingIdentity?.status === "deactivated") throw new Error("IDENTITY_DEACTIVATED");
  const inaccessiblePassword = existingIdentity ? null : await hashPassword(randomBytes(32).toString("base64url"));

  return db.transaction(() => {
    const duplicate = db.prepare("SELECT id FROM company WHERE lower(trim(name)) = lower(trim(?))")
      .get(input.company.name) as { id: number } | undefined;
    if (duplicate) throw new Error("COMPANY_NAME_EXISTS");

    const companyResult = db.prepare(`
      INSERT INTO company (name, time_zone, expiration_date, status) VALUES (?, ?, date('now', '+1 year'), 'active')
    `).run(input.company.name, input.company.timeZone);
    const companyId = Number(companyResult.lastInsertRowid);
    const categoryStatement = db.prepare("INSERT INTO resource_category (company_id, name) VALUES (?, ?)");
    for (const category of FIXED_RESOURCE_CATEGORIES) categoryStatement.run(companyId, category);
    db.prepare(`
      INSERT INTO company_google_sync_state (company_id, state) VALUES (?, 'active')
    `).run(companyId);

    let identityId = existingIdentity?.id;
    if (!identityId) {
      const identityResult = db.prepare(`
        INSERT INTO identity (normalized_email, password_hash, first_name, last_name, status)
        VALUES (?, ?, ?, ?, 'pending')
      `).run(
        normalizedEmail,
        inaccessiblePassword,
        input.company.ownerFirstName,
        input.company.ownerLastName,
      );
      identityId = Number(identityResult.lastInsertRowid);
    }

    const membershipResult = db.prepare(`
      INSERT INTO company_membership (identity_id, company_id, role, status, invited_at)
      VALUES (?, ?, 'owner', 'pending', CURRENT_TIMESTAMP)
    `).run(identityId, companyId);
    const membershipId = Number(membershipResult.lastInsertRowid);
    const invitation = issueInvitation({
      membershipId,
      createdByIdentityId: input.actor.identityId,
      baseUrl: input.baseUrl,
    });
    recordAudit({
      requestId: input.requestId,
      actorIdentityId: input.actor.identityId,
      action: "company.create",
      targetType: "company",
      targetId: companyId,
      companyId,
      result: "success",
      metadata: { firstOwnerMembershipId: membershipId, existingIdentity: !!existingIdentity },
    });
    return { companyId, membershipId, invitationExpiresAt: invitation.expiresAt };
  })();
}

export function suspendCompany(input: { actor: Actor; companyId: number; requestId: string }) {
  return db.transaction(() => {
    const company = db.prepare("SELECT id, name, lower(status) AS status FROM company WHERE id = ?")
      .get(input.companyId) as { id: number; name: string; status: string } | undefined;
    if (!company) throw new Error("COMPANY_NOT_FOUND");
    if (company.status === "suspended") return { companyId: company.id, status: "suspended" as const, revokedSessions: 0, changed: false };
    const changed = db.prepare(`
      UPDATE company SET status = 'suspended', suspended_at = CURRENT_TIMESTAMP,
        version = version + 1 WHERE id = ? AND lower(status) = 'active'
    `).run(company.id);
    if (changed.changes !== 1) throw new Error("COMPANY_STATE_CONFLICT");
    const revoked = db.prepare(`
      UPDATE auth_session SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'company_suspended'
      WHERE active_company_id = ? AND revoked_at IS NULL
    `).run(company.id);
    db.prepare(`
      INSERT INTO company_google_sync_state (company_id, state, pause_reason, paused_at, updated_at)
      VALUES (?, 'paused', 'company_suspended', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(company_id) DO UPDATE SET state = 'paused', pause_reason = 'company_suspended',
        paused_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    `).run(company.id);
    recordAudit({
      requestId: input.requestId,
      actorIdentityId: input.actor.identityId,
      companyId: company.id,
      action: "company.suspend",
      targetType: "company",
      targetId: company.id,
      result: "success",
      metadata: { revokedSessions: revoked.changes, googleSync: "paused", microsoftStorage: "unchanged" },
    });
    return { companyId: company.id, status: "suspended" as const, revokedSessions: revoked.changes, changed: true };
  })();
}

export function restoreCompany(input: { actor: Actor; companyId: number; requestId: string }) {
  return db.transaction(() => {
    const company = db.prepare("SELECT id, name, lower(status) AS status FROM company WHERE id = ?")
      .get(input.companyId) as { id: number; name: string; status: string } | undefined;
    if (!company) throw new Error("COMPANY_NOT_FOUND");
    if (company.status === "active") return { companyId: company.id, status: "active" as const, googleSync: "paused" as const, changed: false };
    const changed = db.prepare(`
      UPDATE company SET status = 'active', suspended_at = NULL,
        version = version + 1 WHERE id = ? AND lower(status) = 'suspended'
    `).run(company.id);
    if (changed.changes !== 1) throw new Error("COMPANY_STATE_CONFLICT");
    db.prepare(`
      INSERT INTO company_google_sync_state (company_id, state, pause_reason, paused_at, updated_at)
      VALUES (?, 'paused', 'restored_review_required', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(company_id) DO UPDATE SET state = 'paused', pause_reason = 'restored_review_required',
        paused_at = COALESCE(paused_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
    `).run(company.id);
    recordAudit({
      requestId: input.requestId,
      actorIdentityId: input.actor.identityId,
      companyId: company.id,
      action: "company.restore",
      targetType: "company",
      targetId: company.id,
      result: "success",
      metadata: { googleSync: "paused_pending_review", microsoftStorage: "unchanged" },
    });
    return { companyId: company.id, status: "active" as const, googleSync: "paused" as const, changed: true };
  })();
}
