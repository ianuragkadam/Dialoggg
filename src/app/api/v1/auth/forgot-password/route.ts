import { NextRequest } from "next/server";
import db from "@/db";
import { issuePasswordReset } from "@/lib/account-tokens";
import { apiError, apiSuccess } from "@/lib/api-response";
import { validateRequestOrigin } from "@/lib/request-security";
import {
  clientAddressHash,
  normalizeEmail,
  rateLimitStatus,
  recordAudit,
  recordRateLimitFailure,
  requestId,
} from "@/lib/security";

const GENERIC_MESSAGE = "If an eligible account exists, a password-reset email will be sent.";

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  if (!validateRequestOrigin(request)) return apiError(403, "ACTION_FORBIDDEN", "Request rejected.", traceId);
  const body = await request.json().catch(() => ({})) as { email?: unknown };
  const email = normalizeEmail(body.email);
  const options = {
    action: "forgot_password",
    discriminator: `${email}:${clientAddressHash(request)}`,
    maximumAttempts: 3,
    windowSeconds: 60 * 60,
    blockSeconds: 60 * 60,
  };
  const rate = rateLimitStatus(options);
  if (!rate.allowed) return apiError(429, "RATE_LIMITED", "Too many attempts. Try again later.", traceId);
  recordRateLimitFailure(options, rate.keyHash);

  const identity = email ? db.prepare(`
    SELECT id FROM identity WHERE normalized_email = ? AND status = 'active'
  `).get(email) as { id: number } | undefined : undefined;
  if (identity) {
    try {
      issuePasswordReset(identity.id, process.env.APP_BASE_URL || request.nextUrl.origin);
      recordAudit({ requestId: traceId, actorIdentityId: identity.id, action: "identity.password_reset.request", result: "success" });
    } catch {
      recordAudit({
        requestId: traceId,
        actorIdentityId: identity.id,
        action: "identity.password_reset.request",
        result: "failure",
        metadata: { reason: "delivery_queue_unavailable" },
      });
    }
  } else {
    recordAudit({ requestId: traceId, action: "identity.password_reset.request", result: "success", metadata: { accountMatched: false } });
  }
  return apiSuccess({ message: GENERIC_MESSAGE }, traceId);
}
