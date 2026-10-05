import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { queueTransactionalEmail } from "@/lib/email-outbox";
import { clientAddressHash, normalizeEmail, rateLimitStatus, recordAudit, recordRateLimitFailure, requestId } from "@/lib/security";
import { validateRequestOrigin } from "@/lib/request-security";

const ACCESS_REQUEST_RECIPIENT = "scottgrote@me.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  if (!validateRequestOrigin(request)) return apiError(403, "ACTION_FORBIDDEN", "Request rejected.", traceId);

  const addressHash = clientAddressHash(request);
  const rateOptions = {
    action: "access_request",
    discriminator: addressHash,
    maximumAttempts: 5,
    windowSeconds: 60 * 60,
    blockSeconds: 60 * 60,
  };
  const rate = rateLimitStatus(rateOptions);
  if (!rate.allowed) return apiError(429, "RATE_LIMITED", "Too many access requests. Please try again later.", traceId);
  recordRateLimitFailure(rateOptions, rate.keyHash);

  const body = await request.json().catch(() => ({})) as { name?: unknown; email?: unknown; message?: unknown };
  const name = String(body.name ?? "").trim();
  const email = normalizeEmail(body.email);
  const message = String(body.message ?? "").trim();
  const fields: Record<string, string> = {};
  if (!name) fields.name = "Enter your name.";
  else if (name.length > 100) fields.name = "Use 100 characters or fewer.";
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) fields.email = "Enter a valid email address.";
  if (!message) fields.message = "Tell us why you need access.";
  else if (message.length > 1000) fields.message = "Use 1,000 characters or fewer.";
  if (Object.keys(fields).length) return apiError(400, "VALIDATION_FAILED", "Please correct the highlighted fields.", traceId, fields);

  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const idempotencyKey = `access-request:${randomUUID()}`;
    queueTransactionalEmail({
      kind: "operational_notification_email",
      idempotencyKey,
      expiresAt,
      email: {
        to: ACCESS_REQUEST_RECIPIENT,
        template: "operational",
        variables: {
          greeting: "A new Dialoggg access request was submitted.",
          subject: "Dialoggg access request",
          message: `Name: ${name}\nEmail: ${email}\n\nRequest details:\n${message}`,
        },
      },
    });
    recordAudit({ requestId: traceId, action: "access_request.submit", result: "success", metadata: { requesterEmailDomain: email.split("@")[1] } });
    return apiSuccess({ message: "Your access request has been submitted." }, traceId);
  } catch {
    recordAudit({ requestId: traceId, action: "access_request.submit", result: "failure", metadata: { reason: "delivery_queue_unavailable" } });
    return apiError(503, "ACCESS_REQUEST_UNAVAILABLE", "We could not submit your request right now. Please try again shortly.", traceId);
  }
}
