import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { apiError, apiSuccess } from "@/lib/api-response";
import { queueTransactionalEmail } from "@/lib/email-outbox";
import { validateMutationRequest } from "@/lib/request-security";
import { rateLimitStatus, recordAudit, recordRateLimitFailure, requestId } from "@/lib/security";

const PLATFORM_OWNER_EMAIL = "scottgrote@me.com";
const LIMIT = { action: "account_platform_contact", maximumAttempts: 5, windowSeconds: 60 * 60, blockSeconds: 60 * 60 };

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "UNAUTHORIZED", "Please sign in again.", id);
  if (actor.contextType !== "company" || !actor.companyId) return apiError(403, "COMPANY_REQUIRED", "Switch to a company account to contact the Platform Owner.", id);
  if (await validateMutationRequest(request, actor)) return apiError(403, "REQUEST_FORBIDDEN", "This request could not be verified. Refresh the page and try again.", id);

  let input: { subject?: unknown; message?: unknown };
  try { input = await request.json(); } catch { return apiError(400, "INVALID_REQUEST", "Enter a subject and message.", id); }
  const subject = typeof input?.subject === "string" ? input.subject.trim() : "";
  const message = typeof input?.message === "string" ? input.message.trim() : "";
  if (!subject || subject.length > 150 || /[\u0000-\u001f\u007f]/u.test(subject) || message.length < 10 || message.length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(message)) {
    return apiError(400, "VALIDATION_FAILED", "Enter a subject (up to 150 characters) and a message (10–5,000 characters).", id);
  }

  const options = { ...LIMIT, discriminator: String(actor.identityId) };
  const limit = rateLimitStatus(options);
  if (!limit.allowed) return apiError(429, "CONTACT_RATE_LIMITED", "Too many messages. Please try again later.", id, undefined, { retryAfterSeconds: limit.retryAfterSeconds || 3600 });

  try {
    queueTransactionalEmail({
      companyId: actor.companyId,
      kind: "operational_notification_email",
      idempotencyKey: `platform-contact:${actor.identityId}:${randomUUID()}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      email: {
        to: PLATFORM_OWNER_EMAIL,
        template: "operational",
        variables: {
          subject: `Dialoggg contact: ${subject}`,
          greeting: `Message from ${actor.firstName} ${actor.lastName} (${actor.email})`,
          message: `Company: ${actor.companyName || actor.companyId}\n\n${message}`,
        },
      },
    });
    recordRateLimitFailure(options, limit.keyHash);
    recordAudit({ actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, requestId: id, action: "account.platform_contact.submit", targetType: "platform", result: "success" });
    return apiSuccess({ submitted: true }, id);
  } catch {
    recordAudit({ actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, requestId: id, action: "account.platform_contact.submit", targetType: "platform", result: "failure" });
    return apiError(503, "CONTACT_UNAVAILABLE", "Your message could not be submitted right now. Please try again later.", id);
  }
}
