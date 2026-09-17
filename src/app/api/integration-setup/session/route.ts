import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  exchangeIntegrationInvitation,
  INTEGRATION_CSRF_COOKIE,
  INTEGRATION_SESSION_COOKIE,
  integrationSession,
} from "@/lib/integration-setup";
import { apiError } from "@/lib/api-response";
import { clientAddressHash, rateLimitStatus, recordRateLimitFailure, requestId, sha256 } from "@/lib/security";

const NO_STORE = { "cache-control": "no-store, max-age=0", pragma: "no-cache" };

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const limiter = {
    action: "integration_invitation_exchange",
    discriminator: clientAddressHash(request),
    maximumAttempts: 12,
    windowSeconds: 900,
    blockSeconds: 900,
  };
  const limit = rateLimitStatus(limiter);
  if (!limit.allowed) return apiError(429, "RATE_LIMITED", "Try this private link again later.", id);
  recordRateLimitFailure(limiter, limit.keyHash);

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  if (!origin || !host || origin !== `${protocol}://${host}`) return apiError(403, "ORIGIN_REJECTED", "Request origin was rejected.", id);

  let token = "";
  try {
    const body = await request.json();
    token = typeof body.token === "string" ? body.token : "";
  } catch {}
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) return apiError(404, "INVITATION_NOT_FOUND", "This private invitation is invalid or expired.", id);
  const exchanged = exchangeIntegrationInvitation(token);
  token = "";
  if (!exchanged) return apiError(404, "INVITATION_NOT_FOUND", "This private invitation is invalid or expired.", id);

  const response = NextResponse.json({
    data: { accessKind: exchanged.invitation.access_kind, expiresAt: exchanged.expiresAt },
    meta: { requestId: id },
  }, { headers: NO_STORE });
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(INTEGRATION_SESSION_COOKIE, exchanged.sessionToken, {
    httpOnly: true, sameSite: "lax", secure, path: "/", expires: new Date(exchanged.expiresAt),
  });
  response.cookies.set(INTEGRATION_CSRF_COOKIE, exchanged.csrfToken, {
    httpOnly: false, sameSite: "strict", secure, path: "/", expires: new Date(exchanged.expiresAt),
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  const id = requestId(request);
  const raw = request.cookies.get(INTEGRATION_SESSION_COOKIE)?.value;
  const session = integrationSession(raw);
  if (session) {
    const csrf = request.cookies.get(INTEGRATION_CSRF_COOKIE)?.value;
    const header = request.headers.get("x-workshop-csrf");
    if (!csrf || csrf !== header || sha256(csrf) !== session.csrfHash) return apiError(403, "CSRF_REJECTED", "Security check failed.", id);
  }
  const response = NextResponse.json({ data: { signedOut: true }, meta: { requestId: id } }, { headers: NO_STORE });
  response.cookies.set(INTEGRATION_SESSION_COOKIE, randomBytes(1).toString("hex"), { httpOnly: true, path: "/", maxAge: 0 });
  response.cookies.set(INTEGRATION_CSRF_COOKIE, "", { httpOnly: false, path: "/", maxAge: 0 });
  return response;
}
