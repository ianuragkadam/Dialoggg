import { randomBytes } from "node:crypto";
import db from "@/db";
import { queueTransactionalEmail } from "@/lib/email-outbox";
import { sha256 } from "@/lib/security";

const INVITATION_HOURS = 72;
const RESET_HOURS = 1;

function expiresInHours(hours: number) {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function actionUrl(baseUrl: string, path: string, token: string) {
  const url = new URL(path, baseUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

export function issueInvitation(input: {
  membershipId: number;
  createdByIdentityId: number;
  baseUrl: string;
}) {
  const target = db.prepare(`
    SELECT cm.id, cm.company_id, cm.status, i.normalized_email, i.first_name, c.name AS company_name
    FROM company_membership cm
    JOIN identity i ON i.id = cm.identity_id
    JOIN company c ON c.id = cm.company_id
    WHERE cm.id = ?
  `).get(input.membershipId) as {
    id: number;
    company_id: number;
    status: string;
    normalized_email: string;
    first_name: string;
    company_name: string;
  } | undefined;
  if (!target || target.status !== "pending") throw new Error("INVITATION_TARGET_INVALID");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = expiresInHours(INVITATION_HOURS);
  return db.transaction(() => {
    db.prepare(`
      UPDATE invitation_token SET revoked_at = CURRENT_TIMESTAMP
      WHERE membership_id = ? AND used_at IS NULL AND revoked_at IS NULL
    `).run(target.id);
    const invitation = db.prepare(`
      INSERT INTO invitation_token (membership_id, token_hash, expires_at, created_by_identity_id)
      VALUES (?, ?, ?, ?)
    `).run(target.id, sha256(token), expiresAt, input.createdByIdentityId);
    const invitationId = Number(invitation.lastInsertRowid);
    queueTransactionalEmail({
      companyId: target.company_id,
      kind: "invitation_email",
      idempotencyKey: `invitation:${invitationId}`,
      expiresAt,
      email: {
        to: target.normalized_email,
        template: "invitation",
        variables: {
          greeting: `Hello ${target.first_name},`,
          message: `You have been invited to join ${target.company_name} in Dialoggg.`,
          actionUrl: actionUrl(input.baseUrl, "/accept-invitation", token),
          expiresAt,
        },
      },
    });
    db.prepare("UPDATE company_membership SET invited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(target.id);
    return { invitationId, expiresAt };
  })();
}

export function issuePlatformAdministratorInvitation(input: {
  identityId: number;
  createdByIdentityId: number;
  baseUrl: string;
}) {
  const target = db.prepare(`
    SELECT id, normalized_email, first_name FROM identity WHERE id = ?
  `).get(input.identityId) as { id: number; normalized_email: string; first_name: string } | undefined;
  if (!target) throw new Error("PLATFORM_ADMIN_INVITATION_TARGET_INVALID");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = expiresInHours(INVITATION_HOURS);
  return db.transaction(() => {
    db.prepare(`
      UPDATE platform_admin_invitation SET revoked_at = CURRENT_TIMESTAMP
      WHERE identity_id = ? AND used_at IS NULL AND revoked_at IS NULL
    `).run(target.id);
    const invitation = db.prepare(`
      INSERT INTO platform_admin_invitation (identity_id, token_hash, expires_at, created_by_identity_id)
      VALUES (?, ?, ?, ?)
    `).run(target.id, sha256(token), expiresAt, input.createdByIdentityId);
    const invitationId = Number(invitation.lastInsertRowid);
    queueTransactionalEmail({
      kind: "invitation_email",
      idempotencyKey: `platform-admin-invitation:${invitationId}`,
      expiresAt,
      email: {
        to: target.normalized_email,
        template: "invitation",
        variables: {
          greeting: `Hello ${target.first_name},`,
          message: "You have been invited to become a Platform Administrator in Dialoggg.",
          actionUrl: actionUrl(input.baseUrl, "/accept-invitation", token),
          expiresAt,
        },
      },
    });
    return { invitationId, expiresAt };
  })();
}

export function issuePasswordReset(identityId: number, baseUrl: string) {
  const identity = db.prepare(`
    SELECT id, normalized_email, first_name FROM identity WHERE id = ? AND status = 'active'
  `).get(identityId) as { id: number; normalized_email: string; first_name: string } | undefined;
  if (!identity) return null;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = expiresInHours(RESET_HOURS);
  return db.transaction(() => {
    db.prepare(`
      UPDATE password_reset_token SET revoked_at = CURRENT_TIMESTAMP
      WHERE identity_id = ? AND used_at IS NULL AND revoked_at IS NULL
    `).run(identity.id);
    const reset = db.prepare(`
      INSERT INTO password_reset_token (identity_id, token_hash, expires_at)
      VALUES (?, ?, ?)
    `).run(identity.id, sha256(token), expiresAt);
    const resetId = Number(reset.lastInsertRowid);
    queueTransactionalEmail({
      kind: "password_reset_email",
      idempotencyKey: `password-reset:${resetId}`,
      expiresAt,
      email: {
        to: identity.normalized_email,
        template: "password_reset",
        variables: {
          greeting: `Hello ${identity.first_name},`,
          message: "A password reset was requested for your Dialoggg account.",
          actionUrl: actionUrl(baseUrl, "/reset-password", token),
          expiresAt,
        },
      },
    });
    return { resetId, expiresAt };
  })();
}

export function invitationForToken(token: string) {
  return db.prepare(`
    SELECT it.id, it.membership_id, cm.identity_id, cm.company_id, cm.status AS membership_status,
      i.status AS identity_status
    FROM invitation_token it
    JOIN company_membership cm ON cm.id = it.membership_id
    JOIN identity i ON i.id = cm.identity_id
    WHERE it.token_hash = ? AND it.used_at IS NULL AND it.revoked_at IS NULL
      AND it.expires_at > CURRENT_TIMESTAMP
  `).get(sha256(token)) as {
    id: number;
    membership_id: number;
    identity_id: number;
    company_id: number;
    membership_status: string;
    identity_status: string;
  } | undefined;
}

export function platformAdministratorInvitationForToken(token: string) {
  return db.prepare(`
    SELECT pai.id, pai.identity_id, i.status AS identity_status
    FROM platform_admin_invitation pai
    JOIN identity i ON i.id = pai.identity_id
    WHERE pai.token_hash = ? AND pai.used_at IS NULL AND pai.revoked_at IS NULL
      AND pai.expires_at > CURRENT_TIMESTAMP
  `).get(sha256(token)) as {
    id: number;
    identity_id: number;
    identity_status: string;
  } | undefined;
}

export function resetForToken(token: string) {
  return db.prepare(`
    SELECT prt.id, prt.identity_id
    FROM password_reset_token prt
    JOIN identity i ON i.id = prt.identity_id
    WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.revoked_at IS NULL
      AND prt.expires_at > CURRENT_TIMESTAMP AND i.status = 'active'
  `).get(sha256(token)) as { id: number; identity_id: number } | undefined;
}
