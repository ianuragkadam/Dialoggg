import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor, listAuthContexts } from "@/lib/auth";
import { requestId } from "@/lib/security";

export async function GET(request: NextRequest) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  return apiSuccess({
    identity: {
      id: actor.identityId,
      email: actor.email,
      firstName: actor.firstName,
      lastName: actor.lastName,
    },
    activeContext: {
      type: actor.contextType,
      companyId: actor.companyId,
      companyName: actor.companyName,
      membershipId: actor.membershipId,
      role: actor.contextType === "platform" ? "platform_administrator" : actor.companyRole,
      actualRole: actor.contextType === "platform" ? "platform_administrator" : actor.actualCompanyRole,
      rolePreview: actor.rolePreview,
    },
    contexts: listAuthContexts(actor.identityId),
    session: { expiresAt: actor.expiresAt },
  }, traceId);
}
