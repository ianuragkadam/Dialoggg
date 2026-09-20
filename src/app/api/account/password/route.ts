import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentActor, hashPassword, revokeIdentitySessions, verifyPassword } from "@/lib/auth";
import { validateMutationRequest } from "@/lib/request-security";
import { clearRateLimit, clientAddressHash, rateLimitStatus, recordAudit, recordRateLimitFailure, requestId } from "@/lib/security";
import { passwordPolicyError, passwordPolicyMessage } from "@/lib/password-policy";

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const responseHeaders = { "x-request-id": traceId, "cache-control": "no-store" };
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: responseHeaders });
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "identity.password.change", result: "denied", metadata: { reason: "request_protection" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: responseHeaders });
  }

  let body: { current_password?: unknown; new_password?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Both current and new password are required." }, { status: 400, headers: responseHeaders });
  }
  const currentPassword = typeof body.current_password === "string" ? body.current_password : "";
  const newPassword = typeof body.new_password === "string" ? body.new_password : "";
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Both current and new password are required." }, { status: 400, headers: responseHeaders });
  }
  const policyError = passwordPolicyError(newPassword);
  if (policyError) {
    return NextResponse.json({ error: passwordPolicyMessage(policyError) }, { status: 400, headers: responseHeaders });
  }

  const rateOptions = {
    action: "password_change_reauth",
    discriminator: `${actor.identityId}:${clientAddressHash(request)}`,
    maximumAttempts: 5,
    windowSeconds: 15 * 60,
    blockSeconds: 15 * 60,
  };
  const rate = rateLimitStatus(rateOptions);
  if (!rate.allowed) {
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "identity.password.change", result: "denied", metadata: { reason: "rate_limited" } });
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { ...responseHeaders, "retry-after": String(rate.retryAfterSeconds || 60) } });
  }

  const identity = db.prepare("SELECT password_hash FROM identity WHERE id = ?").get(actor.identityId) as { password_hash: string };
  if (!(await verifyPassword(currentPassword, identity.password_hash))) {
    recordRateLimitFailure(rateOptions, rate.keyHash);
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "identity.password.change", result: "denied", metadata: { reason: "current_password_invalid" } });
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 403, headers: responseHeaders });
  }
  clearRateLimit(rate.keyHash);

  const passwordHash = await hashPassword(newPassword);
  db.transaction(() => {
    db.prepare("UPDATE identity SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(passwordHash, actor.identityId);
    if (actor.legacyUserId) {
      db.prepare("UPDATE user SET password_hash = ? WHERE id = ?").run(passwordHash, actor.legacyUserId);
    }
    revokeIdentitySessions(actor.identityId, "password_changed", actor.sessionId);
    recordAudit({
      actorIdentityId: actor.identityId,
      actorMembershipId: actor.membershipId,
      companyId: actor.companyId,
      requestId: traceId,
      action: "identity.password.change",
      targetType: "identity",
      targetId: actor.identityId,
      result: "success",
    });
  })();
  return NextResponse.json({ ok: true }, { headers: responseHeaders });
}
