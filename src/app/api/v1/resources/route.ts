import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { validateMutationRequest } from "@/lib/request-security";
import {
  createResource,
  listAvailableResourceUsers,
  listResources,
  normalizeResourceName,
  ResourceValidationError,
  validateResourceInput,
} from "@/lib/resources";
import { RESOURCE_CATEGORIES, type ResourceCategoryUi } from "@/lib/resources-ui";
import { recordAudit, requestId } from "@/lib/security";
import { queueGoogleReconciliation } from "@/lib/google-calendar-queue";

async function requireViewer(traceId: string) {
  const actor = await getCurrentActor();
  if (!actor) return { error: apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId) } as const;
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || actor.companyRole === "external") {
    return { error: apiError(403, "ACTION_FORBIDDEN", "Resources are not available in this access context.", traceId) } as const;
  }
  return { actor } as const;
}

function linkedMembershipId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : Number.NaN;
}

export async function GET(request: NextRequest) {
  const traceId = requestId(request);
  const auth = await requireViewer(traceId);
  if ("error" in auth) return auth.error;
  const canManage = auth.actor.companyRole === "owner" || auth.actor.companyRole === "admin";
  return apiSuccess({
    resources: listResources(auth.actor.companyId!),
    categories: RESOURCE_CATEGORIES,
    availableUsers: canManage ? listAvailableResourceUsers(auth.actor.companyId!) : [],
    permissions: { canManage },
  }, traceId);
}

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const auth = await requireViewer(traceId);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (actor.companyRole !== "owner" && actor.companyRole !== "admin") {
    return apiError(403, "ACTION_FORBIDDEN", "Only an Owner or Admin can add Resources.", traceId);
  }
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "resource.create", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId);
  const parsedName = normalizeResourceName(body.name);
  const category = typeof body.category === "string" ? body.category : "";
  const email = typeof body.email === "string" ? body.email.trim().toLocaleLowerCase("en-US") : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const membershipId = linkedMembershipId(body.linkedMembershipId);
  const fields = validateResourceInput({ name: parsedName.name, category, email, phone });
  if (Number.isNaN(membershipId)) fields.linkedMembershipId = "Choose an available User from this company.";
  if (Object.keys(fields).length) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, fields);
  try {
    const resource = createResource(actor.companyId!, {
      ...parsedName,
      category: category as ResourceCategoryUi,
      email,
      phone,
      linkedMembershipId: membershipId,
    });
    queueGoogleReconciliation(actor.companyId!, "resource.create");
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "resource.create", targetType: "resource", targetId: resource.id, result: "success" });
    return apiSuccess({ resource }, traceId, { status: 201 });
  } catch (error) {
    if (error instanceof ResourceValidationError) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, error.fields);
    if (error instanceof Error && /UNIQUE|ux_resource_company_normalized_name/i.test(error.message)) {
      return apiError(409, "RESOURCE_NAME_EXISTS", `A Resource named “${parsedName.name}” already exists.`, traceId, { name: `A Resource named “${parsedName.name}” already exists.` });
    }
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "resource.create", result: "failure", metadata: { reason: "creation_failed" } });
    return apiError(503, "RESOURCE_CREATE_FAILED", "The Resource could not be created.", traceId);
  }
}
