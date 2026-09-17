import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { createProjectType, listProjectTypes, normalizeProjectTypeName, validateProjectTypeName } from "@/lib/project-types";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

async function requireManager(traceId: string) {
  const actor = await getCurrentActor();
  if (!actor) return { error: apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId) } as const;
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !["owner", "admin"].includes(actor.companyRole ?? "")) {
    return { error: apiError(403, "ACTION_FORBIDDEN", "Only an Owner or Admin can manage Project Types.", traceId) } as const;
  }
  return { actor } as const;
}

export async function GET(request: NextRequest) {
  const traceId = requestId(request);
  const auth = await requireManager(traceId);
  if ("error" in auth) return auth.error;
  return apiSuccess({ projectTypes: listProjectTypes(auth.actor.companyId!) }, traceId);
}

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const auth = await requireManager(traceId);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_type.create", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }
  const body = await request.json().catch(() => null) as { name?: unknown } | null;
  const parsed = normalizeProjectTypeName(body?.name);
  const validation = validateProjectTypeName(parsed.name);
  if (validation) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, { name: validation });
  try {
    const projectType = createProjectType(actor.companyId!, parsed.name, parsed.normalizedName);
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_type.create", targetType: "project_type", targetId: projectType.id, result: "success" });
    return apiSuccess({ projectType }, traceId, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /UNIQUE|project_type\.company_id/i.test(error.message)) {
      return apiError(409, "PROJECT_TYPE_NAME_EXISTS", `A Project Type named “${parsed.name}” already exists.`, traceId, { name: `A Project Type named “${parsed.name}” already exists.` });
    }
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_type.create", result: "failure", metadata: { reason: "creation_failed" } });
    return apiError(503, "PROJECT_TYPE_CREATE_FAILED", "The Project Type could not be created.", traceId);
  }
}
