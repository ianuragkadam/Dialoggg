import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import db from "@/db";
import { getCurrentActor, revokeIdentitySessions } from "@/lib/auth";
import { apiError, apiSuccess } from "@/lib/api-response";
import { validateMutationRequest } from "@/lib/request-security";
import { clearRateLimit, clientAddressHash, normalizeEmail, rateLimitStatus, recordAudit, recordRateLimitFailure, requestId } from "@/lib/security";

const VERIFY_LIMIT = { action: "account_email_change_verify", maximumAttempts: 10, windowSeconds: 15 * 60, blockSeconds: 15 * 60 };

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
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "identity.email_change.verify", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "REQUEST_FORBIDDEN", "This request could not be verified. Refresh the page and try again.", traceId);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid body");
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError(400, "INVALID_REQUEST", "Enter the email address and 8-digit verification code.", traceId);
  }
  const email = normalizeEmail(body.email);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const fields: Record<string, string> = {};
  if (!/^\S+@\S+\.\S{2,}$/u.test(email) || email.length > 254 || email.includes("..")) fields.email = "Enter a valid email address.";
  if (!/^\d{8}$/.test(code)) fields.code = "Enter the 8-digit code from your email.";
  if (Object.keys(fields).length) return apiError(400, "VALIDATION_FAILED", "Please correct the highlighted fields.", traceId, fields);

  const rateOptions = { ...VERIFY_LIMIT, discriminator: `${actor.identityId}:${clientAddressHash(request)}` };
  const rate = rateLimitStatus(rateOptions);
  if (!rate.allowed) {
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "identity.email_change.verify", result: "denied", metadata: { reason: "rate_limited" } });
    return apiError(429, "VERIFICATION_RATE_LIMITED", "Too many code attempts. Please wait before trying again.", traceId, undefined, { retryAfterSeconds: rate.retryAfterSeconds || 60 });
  }

  const challenge = db.prepare(`
    SELECT id, new_email, code_hash, expires_at, attempts
    FROM email_change_challenge
    WHERE identity_id = ? AND new_email = ? AND used_at IS NULL AND revoked_at IS NULL
    ORDER BY id DESC LIMIT 1
  `).get(actor.identityId, email) as { id: number; new_email: string; code_hash: string; expires_at: string; attempts: number } | undefined;
  if (!challenge) return apiError(400, "VERIFICATION_NOT_FOUND", "No active verification code was found for that email. Request a new code and try again.", traceId);
  if (Date.parse(challenge.expires_at) <= Date.now()) {
    db.prepare("UPDATE email_change_challenge SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL").run(challenge.id);
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "identity.email_change.verify", targetType: "identity", targetId: actor.identityId, result: "denied", metadata: { reason: "code_expired" } });
    return apiError(400, "VERIFICATION_EXPIRED", "That code has expired. Request a new verification code.", traceId);
  }
  if (challenge.attempts >= 5) {
    db.prepare("UPDATE email_change_challenge SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL").run(challenge.id);
    return apiError(429, "VERIFICATION_ATTEMPTS_EXHAUSTED", "That code has had too many incorrect attempts. Request a new code.", traceId);
  }

  const expected = Buffer.from(challenge.code_hash, "hex");
  let supplied: Buffer;
  try {
    supplied = Buffer.from(codeDigest(actor.identityId, challenge.new_email, code), "hex");
  } catch {
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "identity.email_change.verify", targetType: "identity", targetId: actor.identityId, result: "failure", metadata: { reason: "verification_unavailable" } });
    return apiError(503, "VERIFICATION_UNAVAILABLE", "Email verification is temporarily unavailable. Please try again later.", traceId);
  }
  const matches = expected.length === supplied.length && timingSafeEqual(expected, supplied);
  if (!matches) {
    const nextAttempts = challenge.attempts + 1;
    db.prepare(`UPDATE email_change_challenge
      SET attempts = ?, revoked_at = CASE WHEN ? >= 5 THEN CURRENT_TIMESTAMP ELSE revoked_at END
      WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL`).run(nextAttempts, nextAttempts, challenge.id);
    recordRateLimitFailure(rateOptions, rate.keyHash);
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "identity.email_change.verify", targetType: "identity", targetId: actor.identityId, result: "denied", metadata: { reason: "invalid_code", remainingAttempts: Math.max(0, 5 - nextAttempts) } });
    if (nextAttempts >= 5) return apiError(429, "VERIFICATION_ATTEMPTS_EXHAUSTED", "That code has had too many incorrect attempts. Request a new code.", traceId);
    return apiError(400, "INVALID_VERIFICATION_CODE", `That code is incorrect. ${5 - nextAttempts} attempt${5 - nextAttempts === 1 ? "" : "s"} remaining.`, traceId, { code: "The verification code is incorrect." });
  }

  try {
    db.transaction(() => {
      const current = db.prepare("SELECT legacy_user_id FROM identity WHERE id = ? AND status = 'active'")
        .get(actor.identityId) as { legacy_user_id: number | null } | undefined;
      const stillActive = db.prepare(`SELECT id FROM email_change_challenge
        WHERE id = ? AND identity_id = ? AND used_at IS NULL AND revoked_at IS NULL AND attempts < 5`)
        .get(challenge.id, actor.identityId);
      if (!current || !stillActive || Date.parse(challenge.expires_at) <= Date.now()) throw new Error("CHALLENGE_NO_LONGER_ACTIVE");
      const existing = db.prepare("SELECT 1 FROM identity WHERE normalized_email = ? AND id <> ? LIMIT 1").get(email, actor.identityId);
      const legacyConflict = current.legacy_user_id
        ? db.prepare("SELECT 1 FROM user WHERE lower(email) = lower(?) AND id <> ? LIMIT 1").get(email, current.legacy_user_id)
        : db.prepare("SELECT 1 FROM user WHERE lower(email) = lower(?) LIMIT 1").get(email);
      const resourceConflict = db.prepare(`
        SELECT 1 FROM resource r
        LEFT JOIN company_membership cm ON cm.id = r.linked_membership_id
        WHERE lower(trim(COALESCE(r.email, ''))) = lower(trim(?))
          AND (cm.identity_id IS NULL OR cm.identity_id <> ?)
        LIMIT 1
      `).get(email, actor.identityId);
      if (existing || legacyConflict || resourceConflict) throw new Error("EMAIL_ALREADY_IN_USE");

      db.prepare(`UPDATE identity SET normalized_email = ?, email_verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(email, actor.identityId);
      if (current.legacy_user_id) db.prepare("UPDATE user SET email = ? WHERE id = ?").run(email, current.legacy_user_id);
      db.prepare("UPDATE email_change_challenge SET used_at = CURRENT_TIMESTAMP WHERE id = ?").run(challenge.id);
      db.prepare(`UPDATE email_change_challenge SET revoked_at = CURRENT_TIMESTAMP
        WHERE identity_id = ? AND id <> ? AND used_at IS NULL AND revoked_at IS NULL`).run(actor.identityId, challenge.id);
      revokeIdentitySessions(actor.identityId, "email_changed", actor.sessionId);
      recordAudit({ actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, requestId: traceId, action: "identity.email_change.verify", targetType: "identity", targetId: actor.identityId, result: "success", metadata: { emailChanged: true, emailVerified: true, otherSessionsRevoked: true } });
    })();
    clearRateLimit(rate.keyHash);
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_IN_USE") {
      return apiError(409, "EMAIL_ALREADY_IN_USE", "That email address is already used by a User or Resource in Dialoggg. Use a different address.", traceId, { email: "This email is already in use." });
    }
    if (error instanceof Error && error.message === "CHALLENGE_NO_LONGER_ACTIVE") {
      return apiError(400, "VERIFICATION_EXPIRED", "That code is no longer active. Request a new verification code.", traceId);
    }
    return apiError(500, "EMAIL_CHANGE_FAILED", "We could not update your email. Your current email is unchanged; please try again.", traceId);
  }

  return apiSuccess({ status: "email_verified", email }, traceId);
}
