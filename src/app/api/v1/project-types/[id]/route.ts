import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { deleteProjectType, getProjectType, normalizeProjectTypeName, renameProjectType, validateProjectTypeName } from "@/lib/project-types";
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

function idFrom(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireManager(traceId);
  if ("error" in auth) return auth.error;
  const projectTypeId = idFrom((await params).id);
  const projectType = projectTypeId ? getProjectType(projectTypeId, auth.actor.companyId!) : null;
  if (!projectType) return apiError(404, "RESOURCE_NOT_FOUND", "Project Type not found.", traceId);
  return apiSuccess({ projectType }, traceId);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireManager(traceId);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_type.rename", targetType: "project_type", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }
  const projectTypeId = idFrom((await params).id);
  if (!projectTypeId || !getProjectType(projectTypeId, actor.companyId!)) return apiError(404, "RESOURCE_NOT_FOUND", "Project Type not found.", traceId);
  const body = await request.json().catch(() => null) as { name?: unknown } | null;
  const parsed = normalizeProjectTypeName(body?.name);
  const validation = validateProjectTypeName(parsed.name);
  if (validation) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, { name: validation });
  try {
    const projectType = renameProjectType(projectTypeId, actor.companyId!, parsed.name, parsed.normalizedName);
    if (!projectType) return apiError(404, "RESOURCE_NOT_FOUND", "Project Type not found.", traceId);
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_type.rename", targetType: "project_type", targetId: projectTypeId, result: "success" });
    return apiSuccess({ projectType }, traceId);
  } catch (error) {
    if (error instanceof Error && /UNIQUE|project_type\.company_id/i.test(error.message)) {
      return apiError(409, "PROJECT_TYPE_NAME_EXISTS", `A Project Type named “${parsed.name}” already exists.`, traceId, { name: `A Project Type named “${parsed.name}” already exists.` });
    }
    return apiError(503, "PROJECT_TYPE_RENAME_FAILED", "The Project Type could not be renamed.", traceId);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireManager(traceId);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_type.delete", targetType: "project_type", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }
  const projectTypeId = idFrom((await params).id);
  if (!projectTypeId) return apiError(404, "RESOURCE_NOT_FOUND", "Project Type not found.", traceId);
  try {
    const result = deleteProjectType(projectTypeId, actor.companyId!);
    if (result.outcome === "not_found") return apiError(404, "RESOURCE_NOT_FOUND", "Project Type not found.", traceId);
    if (result.outcome === "in_use") {
      recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_type.delete", targetType: "project_type", targetId: projectTypeId, result: "denied", metadata: { reason: "in_use", projectCount: result.projectType.projectCount } });
      return apiError(409, "PROJECT_TYPE_IN_USE", "Reassign every affected Project before deleting this Project Type.", traceId, undefined, { affectedProjects: result.projectType.affectedProjects });
    }
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_type.delete", targetType: "project_type", targetId: projectTypeId, result: "success" });
    return apiSuccess({ deletedProjectTypeId: projectTypeId }, traceId);
  } catch {
    return apiError(409, "PROJECT_TYPE_IN_USE", "Reassign every affected Project before deleting this Project Type.", traceId);
  }
}
