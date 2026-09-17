import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { revokeIdentitySessions } from "@/lib/auth";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";
import { getCompanyUser, setProjectAssignments, targetMembership } from "@/lib/user-management";

function idFrom(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireCompanyRole(["owner", "admin"]);
  if ("error" in auth) return auth.error;
  const membershipId = idFrom((await params).id);
  const user = membershipId ? getCompanyUser(auth.actor, membershipId) : null;
  if (!user) return apiError(404, "RESOURCE_NOT_FOUND", "User not found.", traceId);
  return apiSuccess({ user, projects: user.projects }, traceId);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireCompanyRole(["owner", "admin"]);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (await validateMutationRequest(request, actor)) return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  const membershipId = idFrom((await params).id);
  const target = membershipId ? targetMembership(actor, membershipId) : null;
  if (!target) return apiError(404, "RESOURCE_NOT_FOUND", "User not found.", traceId);
  const body = await request.json().catch(() => null) as { projectIds?: unknown } | null;
  if (!Array.isArray(body?.projectIds)) return apiError(400, "VALIDATION_FAILED", "Choose valid Project assignments.", traceId);
  const projectIds = [...new Set(body.projectIds.map(Number))];
  if (projectIds.some(id => !Number.isInteger(id) || id <= 0)) return apiError(400, "VALIDATION_FAILED", "Choose valid Project assignments.", traceId);
  try {
    const user = setProjectAssignments(actor, target.id, projectIds);
    if (!user) return apiError(403, "ACTION_FORBIDDEN", "You cannot change this User's Project assignments.", traceId);
    revokeIdentitySessions(target.identity_id, "project_assignments_changed");
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "membership.projects.update", targetType: "company_membership", targetId: target.id, result: "success", metadata: { projectIds: projectIds.join(","), projectCount: projectIds.length } });
    return apiSuccess({ user, projects: user.projects }, traceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("EXTERNAL_PROJECT_REQUIRED")) return apiError(409, "EXTERNAL_PROJECT_REQUIRED", "An External/Client must remain assigned to at least one Project.", traceId);
    if (message === "PROJECT_SCOPE_INVALID" || message.includes("PROJECT_MEMBERSHIP_SCOPE_INVALID")) return apiError(404, "RESOURCE_NOT_FOUND", "One or more Projects are unavailable.", traceId);
    return apiError(503, "PROJECT_ASSIGNMENTS_FAILED", "Project assignments could not be saved.", traceId);
  }
}
