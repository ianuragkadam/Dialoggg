import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { validateMutationRequest } from "@/lib/request-security";
import { getResource, parseAssignmentIds, setResourceAssignments } from "@/lib/resources";
import { recordAudit, requestId } from "@/lib/security";

function idFrom(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (actor.contextType !== "company" || !actor.companyId || actor.companyRole === "external") return apiError(403, "ACTION_FORBIDDEN", "Resources are not available in this access context.", traceId);
  const resourceId = idFrom((await params).id);
  const resource = resourceId ? getResource(resourceId, actor.companyId) : null;
  if (!resource) return apiError(404, "RESOURCE_NOT_FOUND", "Resource not found.", traceId);
  return apiSuccess({ assignments: resource.assignments }, traceId);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !["owner", "admin"].includes(actor.companyRole ?? "")) {
    return apiError(403, "ACTION_FORBIDDEN", "Only an Owner or Admin can change Resource assignments.", traceId);
  }
  if (await validateMutationRequest(request, actor)) return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  const resourceId = idFrom((await params).id);
  if (!resourceId) return apiError(404, "RESOURCE_NOT_FOUND", "Resource not found.", traceId);
  const body = await request.json().catch(() => null) as { taskIds?: unknown; eventSeriesIds?: unknown } | null;
  const parsed = parseAssignmentIds(body?.taskIds, body?.eventSeriesIds);
  if (!parsed) return apiError(400, "VALIDATION_FAILED", "Task and Event assignment IDs must be positive integers.", traceId);
  try {
    const resource = setResourceAssignments(resourceId, actor.companyId, parsed.taskIds, parsed.eventSeriesIds);
    if (!resource) return apiError(404, "RESOURCE_NOT_FOUND", "Resource not found.", traceId);
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "resource.assignments.update", targetType: "resource", targetId: resourceId, result: "success", metadata: { taskCount: parsed.taskIds.length, eventCount: parsed.eventSeriesIds.length } });
    return apiSuccess({ resource }, traceId);
  } catch (error) {
    if (error instanceof Error && error.message === "RESOURCE_INACTIVE") return apiError(409, "RESOURCE_INACTIVE", "Restore this Resource before adding new Task or Event assignments.", traceId);
    if (error instanceof Error && /RESOURCE_ASSIGNMENT_SCOPE_INVALID|SCOPE_OR_STATUS_INVALID/.test(error.message)) return apiError(404, "RESOURCE_ASSIGNMENT_NOT_FOUND", "One or more Task or Event assignments are unavailable.", traceId);
    return apiError(503, "RESOURCE_ASSIGNMENT_FAILED", "Resource assignments could not be updated.", traceId);
  }
}
