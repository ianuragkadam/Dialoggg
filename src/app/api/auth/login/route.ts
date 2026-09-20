import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import bcrypt from "bcryptjs";
import { verifyPassword, createSession } from "@/lib/auth";
import {
  clearRateLimit,
  clientAddressHash,
  normalizeEmail,
  rateLimitStatus,
  recordAudit,
  recordRateLimitFailure,
  requestId,
} from "@/lib/security";
import { validateRequestOrigin } from "@/lib/request-security";

const DUMMY_PASSWORD_HASH = bcrypt.hashSync("dialoggg-invalid-credential-sentinel", 12);

export async function POST(req: NextRequest) {
  const traceId = requestId(req);
  const responseHeaders = { "x-request-id": traceId, "cache-control": "no-store" };
  if (!validateRequestOrigin(req)) {
    recordAudit({ requestId: traceId, action: "auth.login", result: "denied", metadata: { reason: "request_origin" } });
    return NextResponse.json({ error: "Request rejected" }, { status: 403, headers: responseHeaders });
  }
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401, headers: responseHeaders });
  }
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401, headers: responseHeaders });
  }

  const rateOptions = {
    action: "login",
    discriminator: `${email}:${clientAddressHash(req)}`,
    maximumAttempts: 5,
    windowSeconds: 15 * 60,
    blockSeconds: 15 * 60,
  };
  const rate = rateLimitStatus(rateOptions);
  if (!rate.allowed) {
    recordAudit({ requestId: traceId, action: "auth.login", result: "denied", metadata: { reason: "rate_limited" } });
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { ...responseHeaders, "retry-after": String(rate.retryAfterSeconds || 60) } },
    );
  }

  const identity = db.prepare(`
    SELECT id, normalized_email, password_hash, status
    FROM identity WHERE normalized_email = ?
  `).get(email) as { id: number; normalized_email: string; password_hash: string; status: string } | undefined;
  const ok = await verifyPassword(password, identity?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!identity || identity.status !== "active" || !ok) {
    recordRateLimitFailure(rateOptions, rate.keyHash);
    recordAudit({ requestId: traceId, action: "auth.login", result: "denied", metadata: { reason: "invalid_credentials" } });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401, headers: responseHeaders });
  }

  let session;
  try {
    session = await createSession(identity.id);
  } catch {
    recordRateLimitFailure(rateOptions, rate.keyHash);
    recordAudit({ actorIdentityId: identity.id, requestId: traceId, action: "auth.login", result: "denied", metadata: { reason: "no_authorized_context" } });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401, headers: responseHeaders });
  }
  clearRateLimit(rate.keyHash);

  const context = session.context;
  const name = db.prepare("SELECT first_name, last_name FROM identity WHERE id = ?").get(identity.id) as {
    first_name: string;
    last_name: string;
  };
  const userType = context.type === "platform"
    ? "super_admin"
    : context.role === "employee" ? "internal" : context.role;
  const legacy = context.membershipId
    ? db.prepare("SELECT legacy_user_id FROM company_membership WHERE id = ?").get(context.membershipId) as { legacy_user_id: number | null }
    : null;
  recordAudit({
    actorIdentityId: identity.id,
    actorMembershipId: context.membershipId,
    companyId: context.companyId,
    requestId: traceId,
    action: "auth.login",
    result: "success",
  });

  const responseUser = {
      id: legacy?.legacy_user_id ?? context.membershipId ?? identity.id,
      identity_id: identity.id,
      membership_id: context.membershipId,
      email: identity.normalized_email,
      full_name: `${name.first_name} ${name.last_name}`.trim(),
      user_type: userType,
      company_id: context.companyId,
  };
  return NextResponse.json({
    user: responseUser,
    data: { user: responseUser, context, expiresAt: session.expiresAt },
    meta: { requestId: traceId },
  }, { headers: responseHeaders });
}
