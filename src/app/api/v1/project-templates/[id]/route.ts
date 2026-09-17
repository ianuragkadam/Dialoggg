import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { deleteProjectTemplate, getProjectTemplate, normalizeProjectTemplateName, renameProjectTemplate, validateProjectTemplateName } from "@/lib/project-templates";
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

function idFrom(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireManager(traceId);
  if ("error" in auth) return auth.error;
  const templateId = idFrom((await params).id);
  const projectTemplate = templateId ? getProjectTemplate(templateId, auth.actor.companyId!) : null;
  if (!projectTemplate) return apiError(404, "RESOURCE_NOT_FOUND", "Project Template not found.", traceId);
  return apiSuccess({ projectTemplate }, traceId);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireManager(traceId);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_template.rename", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }
  const templateId = idFrom((await params).id);
  if (!templateId || !getProjectTemplate(templateId, actor.companyId!)) return apiError(404, "RESOURCE_NOT_FOUND", "Project Template not found.", traceId);
  const body = await request.json().catch(() => null) as { name?: unknown } | null;
  const parsed = normalizeProjectTemplateName(body?.name);
  const nameError = validateProjectTemplateName(parsed.name);
  if (nameError) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, { name: nameError });
  try {
    const projectTemplate = renameProjectTemplate(templateId, actor.companyId!, parsed.name, parsed.normalizedName);
    if (!projectTemplate) return apiError(404, "RESOURCE_NOT_FOUND", "Project Template not found.", traceId);
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_template.rename", targetType: "project_template", targetId: templateId, result: "success" });
    return apiSuccess({ projectTemplate }, traceId);
  } catch (error) {
    if (error instanceof Error && /UNIQUE|project_template\.company_id/i.test(error.message)) {
      return apiError(409, "PROJECT_TEMPLATE_NAME_EXISTS", `A Template named “${parsed.name}” already exists.`, traceId, { name: `A Template named “${parsed.name}” already exists.` });
    }
    return apiError(503, "PROJECT_TEMPLATE_RENAME_FAILED", "The Project Template could not be renamed.", traceId);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireManager(traceId);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_template.delete", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }
  const templateId = idFrom((await params).id);
  if (!templateId) return apiError(404, "RESOURCE_NOT_FOUND", "Project Template not found.", traceId);
  const deleted = deleteProjectTemplate(templateId, actor.companyId!);
  if (!deleted) return apiError(404, "RESOURCE_NOT_FOUND", "Project Template not found.", traceId);
  recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_template.delete", targetType: "project_template", targetId: templateId, result: "success" });
  return apiSuccess({ deletedProjectTemplateId: templateId }, traceId);
}
