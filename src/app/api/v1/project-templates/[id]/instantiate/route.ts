import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { instantiateProjectTemplate, ProjectTemplateDomainError, validateIdempotencyKey } from "@/lib/project-templates";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

function idFrom(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !["owner", "admin"].includes(actor.companyRole ?? "")) {
    return apiError(403, "ACTION_FORBIDDEN", "Only an Owner or Admin can use Project Templates.", traceId);
  }
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_template.instantiate", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }
  const templateId = idFrom((await params).id);
  if (!templateId) return apiError(404, "RESOURCE_NOT_FOUND", "Project Template not found.", traceId);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectName = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const startDate = typeof body?.startDate === "string" ? body.startDate.trim() : "";
  const projectTypeId = Number(body?.projectTypeId);
  const idempotencyKey = validateIdempotencyKey(body?.idempotencyKey);
  const fields: Record<string, string> = {};
  if (!projectName || projectName.length > 100) fields.name = "Enter a Project name of 100 characters or fewer.";
  if (!Number.isInteger(projectTypeId) || projectTypeId <= 0) fields.projectTypeId = "Choose exactly one Project Type.";
  if (!startDate) fields.startDate = "Choose the Project Start Date.";
  if (!idempotencyKey) fields.idempotencyKey = "Refresh and try again.";
  if (Object.keys(fields).length) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, fields);
  try {
    const result = instantiateProjectTemplate({
      companyId: actor.companyId,
      membershipId: actor.membershipId,
      legacyUserId: actor.legacyUserId,
      templateId,
      projectTypeId,
      projectName,
      startDate,
      clientName: typeof body?.clientName === "string" && body.clientName.trim() ? body.clientName.trim() : null,
      idempotencyKey: idempotencyKey!,
    });
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId: result.projectId, action: "project_template.instantiate", targetType: "project_template", targetId: templateId, result: "success", metadata: { replayed: result.replayed, copiedTaskCount: result.copiedTaskCount, warningCount: result.warnings.length } });
    return apiSuccess(result, traceId, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof ProjectTemplateDomainError) {
      const status = ["TEMPLATE_NOT_FOUND"].includes(error.code) ? 404 : error.code === "VALIDATION_FAILED" || error.code === "PROJECT_TYPE_INVALID" ? 400 : 409;
      return apiError(status, error.code, error.message, traceId, error.details as Record<string, string> | undefined);
    }
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project_template.instantiate", targetType: "project_template", targetId: templateId, result: "failure" });
    return apiError(503, "PROJECT_TEMPLATE_INSTANTIATION_FAILED", "The Project could not be created from this Template.", traceId);
  }
}
