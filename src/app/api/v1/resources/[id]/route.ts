import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { validateMutationRequest } from "@/lib/request-security";
import {
  getResource,
  listAvailableResourceUsers,
  normalizeResourceName,
  ResourceEmailConflictError,
  ResourceValidationError,
  setResourceLifecycle,
  updateResource,
  validateResourceInput,
} from "@/lib/resources";
import type { ResourceCategoryUi } from "@/lib/resources-ui";
import { recordAudit, requestId } from "@/lib/security";
import { queueGoogleReconciliation } from "@/lib/google-calendar-queue";

function idFrom(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function requireViewer(traceId: string) {
  const actor = await getCurrentActor();
  if (!actor) return { error: apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId) } as const;
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || actor.companyRole === "external") {
    return { error: apiError(403, "ACTION_FORBIDDEN", "Resources are not available in this access context.", traceId) } as const;
  }
  return { actor } as const;
}

function manager(actor: { companyRole: string | null }) {
  return actor.companyRole === "owner" || actor.companyRole === "admin";
}

function membershipId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : Number.NaN;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireViewer(traceId);
  if ("error" in auth) return auth.error;
  const resourceId = idFrom((await params).id);
  const resource = resourceId ? getResource(resourceId, auth.actor.companyId!) : null;
  if (!resource) return apiError(404, "RESOURCE_NOT_FOUND", "Resource not found.", traceId);
  return apiSuccess({
    resource,
    availableUsers: manager(auth.actor) ? listAvailableResourceUsers(auth.actor.companyId!, resource.id) : [],
    permissions: { canManage: manager(auth.actor) },
  }, traceId);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireViewer(traceId);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (!manager(actor)) return apiError(403, "ACTION_FORBIDDEN", "Only an Owner or Admin can edit Resources.", traceId);
  if (await validateMutationRequest(request, actor)) return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  const resourceId = idFrom((await params).id);
  if (!resourceId || !getResource(resourceId, actor.companyId!)) return apiError(404, "RESOURCE_NOT_FOUND", "Resource not found.", traceId);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId);
  const parsedName = normalizeResourceName(body.name);
  const category = typeof body.category === "string" ? body.category : "";
  const email = typeof body.email === "string" ? body.email.trim().toLocaleLowerCase("en-US") : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const linkedMembershipId = membershipId(body.linkedMembershipId);
  const version = Number(body.version);
  const fields = validateResourceInput({ name: parsedName.name, category, email, phone });
  if (Number.isNaN(linkedMembershipId)) fields.linkedMembershipId = "Choose an available User from this company.";
  if (!Number.isInteger(version) || version < 1) fields.version = "Refresh and try again.";
  if (Object.keys(fields).length) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, fields);
  try {
    const resource = updateResource(resourceId, actor.companyId!, {
      ...parsedName, category: category as ResourceCategoryUi, email, phone, linkedMembershipId, version,
    });
    if (!resource) return apiError(409, "RESOURCE_VERSION_CONFLICT", "This Resource changed after you opened it. Refresh and try again.", traceId);
    queueGoogleReconciliation(actor.companyId!, "resource.update");
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "resource.update", targetType: "resource", targetId: resourceId, result: "success" });
    return apiSuccess({ resource, availableUsers: listAvailableResourceUsers(actor.companyId!, resourceId) }, traceId);
  } catch (error) {
    if (error instanceof ResourceEmailConflictError || (error instanceof Error && error.message.includes("EMAIL_ALREADY_IN_USE"))) {
      return apiError(409, "EMAIL_ALREADY_IN_USE", "This email is already used by a User or Resource in Dialoggg. Use a different email address.", traceId, { email: "This email is already in use." });
    }
    if (error instanceof ResourceValidationError) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, error.fields);
    if (error instanceof Error && /UNIQUE|ux_resource_company_normalized_name/i.test(error.message)) {
      return apiError(409, "RESOURCE_NAME_EXISTS", `A Resource named “${parsedName.name}” already exists.`, traceId, { name: `A Resource named “${parsedName.name}” already exists.` });
    }
    return apiError(503, "RESOURCE_UPDATE_FAILED", "The Resource could not be updated.", traceId);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireViewer(traceId);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (!manager(actor)) return apiError(403, "ACTION_FORBIDDEN", "Only an Owner or Admin can change Resource lifecycle.", traceId);
  if (await validateMutationRequest(request, actor)) return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  const resourceId = idFrom((await params).id);
  if (!resourceId) return apiError(404, "RESOURCE_NOT_FOUND", "Resource not found.", traceId);
  const body = await request.json().catch(() => null) as { action?: unknown; version?: unknown } | null;
  const action = body?.action === "deactivate" || body?.action === "restore" ? body.action : null;
  const version = Number(body?.version);
  if (!action || !Number.isInteger(version) || version < 1) return apiError(400, "VALIDATION_FAILED", "Choose a valid lifecycle action and refresh before trying again.", traceId);
  try {
    const resource = setResourceLifecycle(resourceId, actor.companyId!, action, version);
    if (!resource) {
      return getResource(resourceId, actor.companyId!)
        ? apiError(409, "RESOURCE_VERSION_CONFLICT", "This Resource changed after you opened it. Refresh and try again.", traceId)
        : apiError(404, "RESOURCE_NOT_FOUND", "Resource not found.", traceId);
    }
    queueGoogleReconciliation(actor.companyId!, `resource.${action}`);
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: `resource.${action}`, targetType: "resource", targetId: resourceId, result: "success" });
    return apiSuccess({ resource }, traceId);
  } catch (error) {
    if (error instanceof Error && error.message === "RESOURCE_STATE_INVALID") return apiError(409, "RESOURCE_STATE_INVALID", "That lifecycle action is no longer available.", traceId);
    return apiError(503, "RESOURCE_LIFECYCLE_FAILED", "The Resource lifecycle could not be changed.", traceId);
  }
}
