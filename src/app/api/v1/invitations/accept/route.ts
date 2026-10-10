import { NextRequest } from "next/server";
import db from "@/db";
import { invitationForToken, platformAdministratorInvitationForToken } from "@/lib/account-tokens";
import { apiError, apiSuccess } from "@/lib/api-response";
import { createSession, hashPassword, revokeIdentitySessions, verifyPassword, type CompanyRole } from "@/lib/auth";
import { validateRequestOrigin } from "@/lib/request-security";
import { clientAddressHash, rateLimitStatus, recordAudit, recordRateLimitFailure, requestId, sha256 } from "@/lib/security";
import { passwordPolicyError, passwordPolicyMessage } from "@/lib/password-policy";

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  if (!validateRequestOrigin(request)) return apiError(403, "ACTION_FORBIDDEN", "Request rejected.", traceId);
  const body = await request.json().catch(() => ({})) as { token?: unknown; password?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  const options = {
    action: "invitation_accept",
    discriminator: `${sha256(token)}:${clientAddressHash(request)}`,
    maximumAttempts: 5,
    windowSeconds: 15 * 60,
    blockSeconds: 15 * 60,
  };
  const rate = rateLimitStatus(options);
  if (!rate.allowed) return apiError(429, "RATE_LIMITED", "Too many attempts. Try again later.", traceId);
  const invitation = token.length >= 32 ? invitationForToken(token) : undefined;
  const platformInvitation = invitation ? undefined : (token.length >= 32 ? platformAdministratorInvitationForToken(token) : undefined);
  const needsPassword = (invitation?.identity_status ?? platformInvitation?.identity_status) !== "active";
  const policyError = needsPassword ? passwordPolicyError(password) : null;
  if ((!invitation && !platformInvitation) || (invitation && invitation.membership_status !== "pending") || policyError) {
    recordRateLimitFailure(options, rate.keyHash);
    if ((invitation?.membership_status === "pending" || platformInvitation) && policyError) return apiError(400, policyError, passwordPolicyMessage(policyError), traceId);
    return apiError(400, "INVALID_OR_EXPIRED_TOKEN", "This invitation link is invalid, expired, or has been replaced. Ask an Owner or Admin to send a new invitation.", traceId);
  }
  if (platformInvitation) {
    if (!needsPassword) {
      const identity = db.prepare("SELECT password_hash FROM identity WHERE id = ?").get(platformInvitation.identity_id) as { password_hash: string };
      if (!(await verifyPassword(password, identity.password_hash))) {
        recordRateLimitFailure(options, rate.keyHash);
        return apiError(400, "INVALID_CREDENTIALS", "That password did not match your existing Dialoggg account. Enter its current password to accept this invitation.", traceId);
      }
    }
    const passwordHash = needsPassword ? await hashPassword(password) : null;
    const activated = db.transaction(() => {
      const changed = db.prepare(`
        UPDATE platform_admin_invitation SET used_at = CURRENT_TIMESTAMP
        WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      `).run(platformInvitation.id);
      if (changed.changes !== 1) return false;
      db.prepare(`
        UPDATE identity SET is_platform_admin = 1,
          password_hash = COALESCE(?, password_hash),
          status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
          email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(passwordHash, platformInvitation.identity_id);
      db.prepare(`
        UPDATE platform_admin_invitation SET revoked_at = CURRENT_TIMESTAMP
        WHERE identity_id = ? AND id <> ? AND used_at IS NULL AND revoked_at IS NULL
      `).run(platformInvitation.identity_id, platformInvitation.id);
      revokeIdentitySessions(platformInvitation.identity_id, "platform_administrator_invitation_accepted");
      recordAudit({
        requestId: traceId,
        actorIdentityId: platformInvitation.identity_id,
        action: "platform_administrator.invitation.accept",
        targetType: "identity",
        targetId: platformInvitation.identity_id,
        result: "success",
      });
      return true;
    })();
    if (!activated) return apiError(400, "INVALID_OR_EXPIRED_TOKEN", "This invitation link is invalid, expired, or has been replaced. Ask an Owner or Admin to send a new invitation.", traceId);
    const session = await createSession(platformInvitation.identity_id, { type: "platform" });
    return apiSuccess({ status: "accepted", context: session.context, expiresAt: session.expiresAt }, traceId, { status: 201 });
  }
  if (!invitation) return apiError(400, "INVALID_OR_EXPIRED_TOKEN", "This invitation link is invalid, expired, or has been replaced. Ask an Owner or Admin to send a new invitation.", traceId);
  if (!needsPassword) {
    const identity = db.prepare("SELECT password_hash FROM identity WHERE id = ?").get(invitation.identity_id) as { password_hash: string };
    if (!(await verifyPassword(password, identity.password_hash))) {
      recordRateLimitFailure(options, rate.keyHash);
      return apiError(400, "INVALID_CREDENTIALS", "That password did not match your existing Dialoggg account. Enter its current password to accept this invitation.", traceId);
    }
  }
  const passwordHash = needsPassword ? await hashPassword(password) : null;
  const activated = db.transaction(() => {
    const changed = db.prepare(`
      UPDATE invitation_token SET used_at = CURRENT_TIMESTAMP
      WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `).run(invitation.id);
    if (changed.changes !== 1) return false;
    const membership = db.prepare(`SELECT role, invited_first_name, invited_last_name
      FROM company_membership WHERE id = ? AND company_id = ?`).get(invitation.membership_id, invitation.company_id) as {
        role: CompanyRole;
        invited_first_name: string | null;
        invited_last_name: string | null;
      };
    // Identity names are global across companies. Keep an existing account's profile
    // intact; the name entered for this invitation belongs to this membership only.
    if (passwordHash) {
      db.prepare(`
        UPDATE identity SET password_hash = ?, status = 'active',
          first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name),
          email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(passwordHash, membership.invited_first_name, membership.invited_last_name, invitation.identity_id);
    }
    const identity = db.prepare(`
      SELECT i.legacy_user_id, i.normalized_email, i.password_hash, i.first_name, i.last_name,
        u.company_id AS legacy_company_id
      FROM identity i LEFT JOIN user u ON u.id = i.legacy_user_id WHERE i.id = ?
    `).get(invitation.identity_id) as {
      legacy_user_id: number | null;
      normalized_email: string;
      password_hash: string;
      first_name: string;
      last_name: string;
      legacy_company_id: number | null;
    };
    const memberFullName = `${membership.invited_first_name || identity.first_name} ${membership.invited_last_name || identity.last_name}`.trim();
    let legacyUserId = identity.legacy_user_id;
    let membershipLegacyUserId = identity.legacy_company_id === invitation.company_id ? legacyUserId : null;
    if (legacyUserId && identity.legacy_company_id === invitation.company_id) {
      db.prepare("UPDATE user SET full_name = ? WHERE id = ?")
        .run(memberFullName, legacyUserId);
    }
    if (!legacyUserId) {
      const legacy = db.prepare(`
        INSERT INTO user (company_id, email, password_hash, full_name, user_type)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        invitation.company_id,
        identity.normalized_email,
        passwordHash ?? identity.password_hash,
        memberFullName,
        membership.role === "employee" ? "internal" : membership.role,
      );
      legacyUserId = Number(legacy.lastInsertRowid);
      membershipLegacyUserId = legacyUserId;
      db.prepare("UPDATE identity SET legacy_user_id = ? WHERE id = ?").run(legacyUserId, invitation.identity_id);
    } else if (passwordHash) {
      db.prepare("UPDATE user SET password_hash = ? WHERE id = ?").run(passwordHash, legacyUserId);
    }
    db.prepare(`
      UPDATE company_membership SET status = 'active', legacy_user_id = COALESCE(legacy_user_id, ?),
        accepted_at = CURRENT_TIMESTAMP, deactivated_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(membershipLegacyUserId, invitation.membership_id);
    if (membershipLegacyUserId) {
      db.prepare(`
        INSERT OR IGNORE INTO project_user (project_id, user_id)
        SELECT project_id, ? FROM project_membership WHERE company_membership_id = ?
      `).run(membershipLegacyUserId, invitation.membership_id);
    }
    db.prepare(`
      UPDATE invitation_token SET revoked_at = CURRENT_TIMESTAMP
      WHERE membership_id = ? AND id <> ? AND used_at IS NULL AND revoked_at IS NULL
    `).run(invitation.membership_id, invitation.id);
    revokeIdentitySessions(invitation.identity_id, "invitation_accepted");
    recordAudit({
      requestId: traceId,
      actorIdentityId: invitation.identity_id,
      actorMembershipId: invitation.membership_id,
      companyId: invitation.company_id,
      action: "membership.invitation.accept",
      targetType: "company_membership",
      targetId: invitation.membership_id,
      result: "success",
    });
    return true;
  })();
  if (!activated) return apiError(400, "INVALID_OR_EXPIRED_TOKEN", "This invitation link is invalid, expired, or has been replaced. Ask an Owner or Admin to send a new invitation.", traceId);
  const session = await createSession(invitation.identity_id, { type: "company", membershipId: invitation.membership_id });
  return apiSuccess({ status: "accepted", context: session.context, expiresAt: session.expiresAt }, traceId, { status: 201 });
}
