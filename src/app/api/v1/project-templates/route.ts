import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import {
  listProjectTemplates,
  listTemplateSourceProjects,
  normalizeProjectTemplateName,
  ProjectTemplateDomainError,
  saveProjectAsTemplate,
  validateIdempotencyKey,
  validateProjectTemplateName,
} from "@/lib/project-templates";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

async function requireManager(traceId: string) {
  const actor = await getCurrentActor();
  if (!actor) return { error: apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId) } as const;
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !["owner", "admin"].includes(actor.companyRole ?? "")) {
    return { error: apiError(403, "ACTION_FORBIDDEN", "Only an Owner or Admin can manage Project Templates.", traceId) } as const;
  }
  return { actor } as const;
}

export async function GET(request: NextRequest) {
  const traceId = requestId(request);
  const auth = await requireManager(traceId);
  if ("error" in auth) return auth.error;
  return apiSuccess({
    projectTemplates: listProjectTemplates(auth.actor.companyId!),
    sourceProjects: listTemplateSourceProjects(auth.actor.companyId!),
  }, traceId);
}

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const auth = await requireManager(traceId);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_template.create", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = normalizeProjectTemplateName(body?.name);
  const nameError = validateProjectTemplateName(parsed.name);
  const sourceProjectId = Number(body?.sourceProjectId);
  const idempotencyKey = validateIdempotencyKey(body?.idempotencyKey);
  const fields: Record<string, string> = {};
  if (nameError) fields.name = nameError;
  if (!Number.isInteger(sourceProjectId) || sourceProjectId <= 0) fields.sourceProjectId = "Choose the Project Plan to save.";
  if (!idempotencyKey) fields.idempotencyKey = "Refresh and try again.";
  if (Object.keys(fields).length) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, fields);

  try {
    const result = saveProjectAsTemplate({
      companyId: actor.companyId!,
      membershipId: actor.membershipId!,
      sourceProjectId,
      name: parsed.name,
      normalizedName: parsed.normalizedName,
      includeResourceAssignments: body?.includeResourceAssignments === true,
      idempotencyKey: idempotencyKey!,
    });
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId: sourceProjectId, action: "project_template.create", targetType: "project_template", targetId: result.template.id, result: "success", metadata: { replayed: result.replayed, includeResourceAssignments: result.template.includeResourceAssignments } });
    return apiSuccess(result, traceId, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof ProjectTemplateDomainError) {
      const status = error.code === "TEMPLATE_SOURCE_NOT_FOUND" ? 404 : 409;
      return apiError(status, error.code, error.message, traceId, undefined, error.details);
    }
    if (error instanceof Error && /UNIQUE|project_template\.company_id/i.test(error.message)) {
      return apiError(409, "PROJECT_TEMPLATE_NAME_EXISTS", `A Template named “${parsed.name}” already exists.`, traceId, { name: `A Template named “${parsed.name}” already exists.` });
    }
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId: sourceProjectId, action: "project_template.create", result: "failure" });
    return apiError(503, "PROJECT_TEMPLATE_CREATE_FAILED", "The Project Template could not be saved.", traceId);
  }
}
