import { createHmac, randomInt } from "node:crypto";
import { NextRequest } from "next/server";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { apiError, apiSuccess } from "@/lib/api-response";
import { canonicalAppOrigin, validateMutationRequest } from "@/lib/request-security";
import { clearRateLimit, clientAddressHash, normalizeEmail, rateLimitStatus, recordAudit, recordRateLimitFailure, requestId } from "@/lib/security";
import { queueTransactionalEmail } from "@/lib/email-outbox";

const EMAIL_CODE_TTL_MINUTES = 10;
const EMAIL_SEND_LIMIT = { action: "account_email_change_send", maximumAttempts: 3, windowSeconds: 60 * 60, blockSeconds: 60 * 60 };

function codeDigest(identityId: number, email: string, code: string) {
  const encoded = process.env.APP_ENCRYPTION_KEY;
  if (!encoded) throw new Error("OTP_HASH_SECRET_UNAVAILABLE");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("OTP_HASH_SECRET_INVALID");
  return createHmac("sha256", key).update(`account-email-change:v1:${identityId}:${email}:${code}`).digest("hex");
}

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "UNAUTHORIZED", "Please sign in again.", traceId);
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "identity.profile.update", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "REQUEST_FORBIDDEN", "This request could not be verified. Refresh the page and try again.", traceId);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid body");
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError(400, "INVALID_REQUEST", "Enter your first name, last name, and email address.", traceId);
  }

  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const email = normalizeEmail(body.email);
  const fields: Record<string, string> = {};
  if (!firstName) fields.firstName = "First name is required.";
  else if (firstName.length > 80 || /[\u0000-\u001f\u007f]/.test(firstName)) fields.firstName = "Use up to 80 characters without control characters.";
  if (lastName.length > 80 || /[\u0000-\u001f\u007f]/.test(lastName)) fields.lastName = "Use up to 80 characters without control characters.";
  if (email.length > 254 || !/^\S+@\S+\.\S{2,}$/u.test(email) || email.includes("..")) fields.email = "Enter a valid email address.";
  if (Object.keys(fields).length) return apiError(400, "VALIDATION_FAILED", "Please correct the highlighted fields.", traceId, fields);

  const identity = db.prepare(`
    SELECT id, legacy_user_id, normalized_email FROM identity WHERE id = ? AND status = 'active'
  `).get(actor.identityId) as { id: number; legacy_user_id: number | null; normalized_email: string } | undefined;
  if (!identity) return apiError(401, "ACCOUNT_UNAVAILABLE", "This account is no longer active. Sign in again.", traceId);

  const legacyConflict = identity.legacy_user_id
    ? db.prepare("SELECT 1 FROM user WHERE lower(email) = lower(?) AND id <> ? LIMIT 1").get(email, identity.legacy_user_id)
    : db.prepare("SELECT 1 FROM user WHERE lower(email) = lower(?) LIMIT 1").get(email);
  const identityConflict = db.prepare("SELECT 1 FROM identity WHERE normalized_email = ? AND id <> ? LIMIT 1").get(email, identity.id);
  const resourceConflict = db.prepare(`
    SELECT 1 FROM resource r
    LEFT JOIN company_membership cm ON cm.id = r.linked_membership_id
    WHERE lower(trim(COALESCE(r.email, ''))) = lower(trim(?))
      AND (cm.identity_id IS NULL OR cm.identity_id <> ?)
    LIMIT 1
  `).get(email, identity.id);
  if (email !== identity.normalized_email && (identityConflict || legacyConflict || resourceConflict)) {
    return apiError(409, "EMAIL_ALREADY_IN_USE", "That email address is already used by a User or Resource in Dialoggg. Use a different address.", traceId, { email: "This email is already in use." });
  }

  const fullName = `${firstName} ${lastName}`.trim();
  if (email === identity.normalized_email) {
    try {
      db.transaction(() => {
        db.prepare("UPDATE identity SET first_name = ?, last_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(firstName, lastName, identity.id);
        if (identity.legacy_user_id) db.prepare("UPDATE user SET full_name = ?, email = ? WHERE id = ?")
          .run(fullName, email, identity.legacy_user_id);
        recordAudit({ actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, requestId: traceId, action: "identity.profile.update", targetType: "identity", targetId: identity.id, result: "success", metadata: { nameChanged: true, emailChanged: false } });
      })();
    } catch {
      return apiError(500, "PROFILE_UPDATE_FAILED", "Your profile could not be saved. Please try again.", traceId);
    }
    return apiSuccess({ status: "profile_updated", firstName, lastName, email }, traceId);
  }

  const rateOptions = { ...EMAIL_SEND_LIMIT, discriminator: `${identity.id}:${clientAddressHash(request)}` };
  const rate = rateLimitStatus(rateOptions);
  if (!rate.allowed) {
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "identity.email_change.request", result: "denied", metadata: { reason: "rate_limited" } });
    return apiError(429, "EMAIL_CODE_RATE_LIMITED", "Too many verification-code requests. Please try again later.", traceId, undefined, { retryAfterSeconds: rate.retryAfterSeconds || 60 });
  }

  const code = randomInt(0, 100_000_000).toString().padStart(8, "0");
  const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MINUTES * 60_000).toISOString();
  try {
    db.transaction(() => {
      db.prepare(`UPDATE email_change_challenge SET revoked_at = CURRENT_TIMESTAMP
        WHERE identity_id = ? AND used_at IS NULL AND revoked_at IS NULL`).run(identity.id);
      db.prepare("UPDATE identity SET first_name = ?, last_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(firstName, lastName, identity.id);
      if (identity.legacy_user_id) db.prepare("UPDATE user SET full_name = ? WHERE id = ?").run(fullName, identity.legacy_user_id);
      const challenge = db.prepare(`
        INSERT INTO email_change_challenge (identity_id, new_email, code_hash, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(identity.id, email, codeDigest(identity.id, email, code), expiresAt);
      const challengeId = Number(challenge.lastInsertRowid);
      queueTransactionalEmail({
        companyId: actor.companyId,
        kind: "operational_notification_email",
        idempotencyKey: `account-email-change:${challengeId}`,
        expiresAt,
        email: {
          to: email,
          template: "operational",
          variables: {
            greeting: `Hello ${firstName},`,
            message: `Your Dialoggg email verification code is ${code}. Enter this 8-digit code in your account settings to confirm the email change. If you did not request this, you can ignore this message.`,
            actionLabel: "Open Account Settings",
            actionUrl: new URL("/account", canonicalAppOrigin(request)).toString(),
            expiresAt,
            subject: "Verify your new Dialoggg email address",
          },
        },
      });
      recordAudit({ actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, requestId: traceId, action: "identity.email_change.request", targetType: "identity", targetId: identity.id, result: "success", metadata: { verificationCodeSent: true } });
    })();
    recordRateLimitFailure(rateOptions, rate.keyHash);
  } catch {
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "identity.email_change.request", result: "failure", metadata: { reason: "delivery_queue_failed" } });
    return apiError(503, "EMAIL_CODE_UNAVAILABLE", "We could not send a verification code right now. Your current email is unchanged; please try again shortly.", traceId);
  }

  return apiSuccess({ status: "verification_required", email, expiresAt, codeLength: 8 }, traceId);
}
