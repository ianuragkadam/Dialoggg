import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { revokeIdentitySessions, type CompanyRole } from "@/lib/auth";
import { canManageMembership, canSetMembershipRole } from "@/lib/authorization";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";
import {
  getCompanyUser,
  normalizePersonName,
  setMembershipLifecycle,
  targetMembership,
  updateMembershipRole,
  updateUserProfile,
  validateProfile,
} from "@/lib/user-management";

function idFrom(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function roleFrom(value: unknown): CompanyRole | null {
  return value === "owner" || value === "admin" || value === "employee" || value === "external" ? value : null;
}

async function manager(request: NextRequest, traceId: string) {
  const auth = await requireCompanyRole(["owner", "admin"]);
  if ("error" in auth) return auth;
  if (!["GET", "HEAD"].includes(request.method) && await validateMutationRequest(request, auth.actor)) {
    return { error: apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId) } as const;
  }
  return auth;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await manager(request, traceId);
  if ("error" in auth) return auth.error;
  const membershipId = idFrom((await params).id);
  const user = membershipId ? getCompanyUser(auth.actor, membershipId) : null;
  if (!user) return apiError(404, "RESOURCE_NOT_FOUND", "User not found.", traceId);
  return apiSuccess({ user }, traceId);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await manager(request, traceId);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  const membershipId = idFrom((await params).id);
  const target = membershipId ? targetMembership(actor, membershipId) : null;
  if (!target) return apiError(404, "RESOURCE_NOT_FOUND", "User not found.", traceId);
  if (!canManageMembership(actor, { membershipId: target.id, role: target.role, status: target.status })) {
    return apiError(403, "ACTION_FORBIDDEN", "You cannot manage this membership.", traceId);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError(400, "VALIDATION_FAILED", "Enter valid User details.", traceId);
  if (Object.hasOwn(body, "email") && String(body.email).trim().toLowerCase() !== target.normalized_email.toLowerCase()) {
    return apiError(409, "VERIFIED_EMAIL_CHANGE_REQUIRED", "Login Email cannot be changed by a company administrator. The User must complete a verified email-change flow.", traceId, { email: "A verified self-service email change is required." });
  }
  const firstName = normalizePersonName(body.firstName ?? target.first_name);
  const lastName = normalizePersonName(body.lastName ?? target.last_name);
  const phone = typeof body.phone === "string" ? body.phone.trim() : target.phone ?? "";
  const fields = validateProfile(firstName, lastName, phone);
  if (Object.keys(fields).length) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, fields);
  const nextRole = Object.hasOwn(body, "role") ? roleFrom(body.role) : target.role;
  if (!nextRole) return apiError(400, "VALIDATION_FAILED", "Choose a valid Role.", traceId, { role: "Choose Owner, Admin, Employee (Internal), or External/Client." });
  if (!canSetMembershipRole(actor, { membershipId: target.id, role: target.role, status: target.status }, nextRole)) {
    return apiError(403, "ACTION_FORBIDDEN", "Only an Owner can manage Owner or Admin Roles.", traceId);
  }
  if (nextRole === "external") {
    const current = getCompanyUser(actor, target.id)!;
    if (!current.projects.some(project => project.assigned)) {
      return apiError(409, "EXTERNAL_PROJECT_REQUIRED", "Assign at least one Project before changing this membership to External/Client.", traceId);
    }
  }
  try {
    updateUserProfile(actor, target.id, { firstName, lastName, phone });
    if (nextRole !== target.role) updateMembershipRole(actor, target.id, nextRole);
    revokeIdentitySessions(target.identity_id, nextRole !== target.role ? "membership_role_changed" : "membership_profile_changed");
    const user = getCompanyUser(actor, target.id)!;
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "membership.update", targetType: "company_membership", targetId: target.id, result: "success", metadata: { roleFrom: target.role, roleTo: nextRole, emailChanged: false } });
    return apiSuccess({ user }, traceId);
  } catch (error) {
    if (error instanceof Error && /FINAL_ACTIVE_OWNER_REQUIRED/.test(error.message)) return apiError(409, "FINAL_OWNER_REQUIRED", "Add another active Owner before changing the final Owner.", traceId);
    return apiError(503, "MEMBERSHIP_UPDATE_FAILED", "The User could not be updated.", traceId);
  }
}

async function lifecycle(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  suppliedAction?: "deactivate" | "restore" | "cancel_invitation",
) {
  const traceId = requestId(request);
  const auth = await manager(request, traceId);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  const membershipId = idFrom((await context.params).id);
  const target = membershipId ? targetMembership(actor, membershipId) : null;
  if (!target) return apiError(404, "RESOURCE_NOT_FOUND", "User not found.", traceId);
  if (!canManageMembership(actor, { membershipId: target.id, role: target.role, status: target.status })) {
    return apiError(403, "ACTION_FORBIDDEN", "You cannot manage this membership.", traceId);
  }
  const body = suppliedAction ? null : await request.json().catch(() => null) as { action?: unknown } | null;
  const action = suppliedAction ?? body?.action;
  if (action !== "deactivate" && action !== "restore" && action !== "cancel_invitation") {
    return apiError(400, "VALIDATION_FAILED", "Choose a valid lifecycle action.", traceId);
  }
  try {
    const user = setMembershipLifecycle(actor, target.id, action);
    if (!user) return apiError(403, "ACTION_FORBIDDEN", "You cannot manage this membership.", traceId);
    revokeIdentitySessions(target.identity_id, `membership_${action}`);
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: `membership.${action}`, targetType: "company_membership", targetId: target.id, result: "success" });
    return apiSuccess({ user }, traceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SELF_LIFECYCLE_FORBIDDEN") return apiError(409, "SELF_LIFECYCLE_FORBIDDEN", "You cannot deactivate your current membership.", traceId);
    if (message.includes("FINAL_ACTIVE_OWNER_REQUIRED")) return apiError(409, "FINAL_OWNER_REQUIRED", "Add another active Owner before deactivating the final Owner.", traceId);
    if (message === "EXTERNAL_PROJECT_REQUIRED") return apiError(409, "EXTERNAL_PROJECT_REQUIRED", "Assign at least one Project before restoring this External/Client.", traceId);
    if (message === "MEMBERSHIP_STATE_INVALID") return apiError(409, "MEMBERSHIP_STATE_INVALID", "That action is not available for the current membership state.", traceId);
    return apiError(503, "MEMBERSHIP_LIFECYCLE_FAILED", "The membership could not be updated.", traceId);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return lifecycle(request, context);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return lifecycle(request, context, "deactivate");
}
