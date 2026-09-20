import { NextRequest } from "next/server";
import db from "@/db";
import { resetForToken } from "@/lib/account-tokens";
import { apiError, apiSuccess } from "@/lib/api-response";
import { hashPassword, revokeIdentitySessions } from "@/lib/auth";
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
    action: "password_reset_consume",
    discriminator: `${sha256(token)}:${clientAddressHash(request)}`,
    maximumAttempts: 5,
    windowSeconds: 15 * 60,
    blockSeconds: 15 * 60,
  };
  const rate = rateLimitStatus(options);
  if (!rate.allowed) return apiError(429, "RATE_LIMITED", "Too many attempts. Try again later.", traceId);
  const policyError = passwordPolicyError(password);
  if (token.length < 32 || policyError) {
    recordRateLimitFailure(options, rate.keyHash);
    if (token.length >= 32 && policyError) return apiError(400, policyError, passwordPolicyMessage(policyError), traceId);
    return apiError(400, "INVALID_OR_EXPIRED_TOKEN", "This reset link is invalid or expired.", traceId);
  }
  const reset = resetForToken(token);
  if (!reset) {
    recordRateLimitFailure(options, rate.keyHash);
    return apiError(400, "INVALID_OR_EXPIRED_TOKEN", "This reset link is invalid or expired.", traceId);
  }
  const passwordHash = await hashPassword(password);
  const consumed = db.transaction(() => {
    const changed = db.prepare(`
      UPDATE password_reset_token SET used_at = CURRENT_TIMESTAMP
      WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `).run(reset.id);
    if (changed.changes !== 1) return false;
    db.prepare("UPDATE identity SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(passwordHash, reset.identity_id);
    db.prepare(`
      UPDATE user SET password_hash = ? WHERE id = (SELECT legacy_user_id FROM identity WHERE id = ?)
    `).run(passwordHash, reset.identity_id);
    db.prepare(`
      UPDATE password_reset_token SET revoked_at = CURRENT_TIMESTAMP
      WHERE identity_id = ? AND id <> ? AND used_at IS NULL AND revoked_at IS NULL
    `).run(reset.identity_id, reset.id);
    revokeIdentitySessions(reset.identity_id, "password_reset");
    recordAudit({
      requestId: traceId,
      actorIdentityId: reset.identity_id,
      action: "identity.password_reset.complete",
      targetType: "identity",
      targetId: reset.identity_id,
      result: "success",
    });
    return true;
  })();
  if (!consumed) return apiError(400, "INVALID_OR_EXPIRED_TOKEN", "This reset link is invalid or expired.", traceId);
  return apiSuccess({ status: "password_reset" }, traceId);
}
