import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { suspendCompany } from "@/lib/company-administration";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (actor.contextType !== "platform" || !actor.isPlatformAdmin) {
    return apiError(403, "ACTION_FORBIDDEN", "Platform Administrator access is required.", traceId);
  }
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, action: "company.suspend", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }
  const companyId = Number((await params).id);
  if (!Number.isInteger(companyId) || companyId <= 0) return apiError(404, "RESOURCE_NOT_FOUND", "Company not found.", traceId);
  try {
    return apiSuccess(suspendCompany({ actor, companyId, requestId: traceId }), traceId);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "COMPANY_NOT_FOUND") return apiError(404, "RESOURCE_NOT_FOUND", "Company not found.", traceId);
    return apiError(409, "STATE_CONFLICT", "The company state changed. Refresh and try again.", traceId);
  }
}
