import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor, rotateActiveContext } from "@/lib/auth";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

export async function PUT(request: NextRequest) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "auth.context.change", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }

  let body: { type?: unknown; membershipId?: unknown };
  try { body = await request.json(); } catch {
    return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId);
  }
  const type = body.type === "platform" ? "platform" : body.type === "company" ? "company" : null;
  const membershipId = Number(body.membershipId);
  if (!type || (type === "company" && (!Number.isInteger(membershipId) || membershipId <= 0))) {
    return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, { context: "Choose an authorized context." });
  }
  try {
    const session = await rotateActiveContext({ type, membershipId: type === "company" ? membershipId : null });
    recordAudit({
      actorIdentityId: actor.identityId,
      actorMembershipId: session.context.membershipId,
      companyId: session.context.companyId,
      requestId: traceId,
      action: "auth.context.change",
      result: "success",
    });
    return apiSuccess({ activeContext: session.context }, traceId);
  } catch {
    recordAudit({ actorIdentityId: actor.identityId, requestId: traceId, action: "auth.context.change", result: "denied", metadata: { reason: "context_forbidden" } });
    return apiError(404, "RESOURCE_NOT_FOUND", "The requested context is unavailable.", traceId);
  }
}
