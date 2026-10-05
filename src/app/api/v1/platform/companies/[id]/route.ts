import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { deleteCompany, getCompanyOperationalMetadata, updateCompanyExpiration, updateCompanyProfile, validateCompanyProfileInput } from "@/lib/company-administration";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (actor.contextType !== "platform" || !actor.isPlatformAdmin) {
    return apiError(403, "ACTION_FORBIDDEN", "Platform Administrator access is required.", traceId);
  }
  const companyId = Number((await params).id);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    return apiError(404, "RESOURCE_NOT_FOUND", "Company not found.", traceId);
  }
  const company = getCompanyOperationalMetadata(companyId);
  if (!company) return apiError(404, "RESOURCE_NOT_FOUND", "Company not found.", traceId);
  return apiSuccess({ company }, traceId);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (actor.contextType !== "platform" || !actor.isPlatformAdmin) return apiError(403, "ACTION_FORBIDDEN", "Platform Administrator access is required.", traceId);
  if (await validateMutationRequest(request, actor)) return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  const companyId = Number((await params).id);
  if (!Number.isInteger(companyId) || companyId <= 0) return apiError(404, "RESOURCE_NOT_FOUND", "Company not found.", traceId);
  if (!getCompanyOperationalMetadata(companyId)) return apiError(404, "RESOURCE_NOT_FOUND", "Company not found.", traceId);
  const body = await request.json().catch(() => null) as { expirationDate?: unknown; name?: unknown; timeZone?: unknown; firstName?: unknown; lastName?: unknown; ownerEmail?: unknown } | null;
  if (!body) return apiError(400, "VALIDATION_FAILED", "Provide valid company updates.", traceId);
  if (Object.hasOwn(body, "name") || Object.hasOwn(body, "timeZone") || Object.hasOwn(body, "firstName") || Object.hasOwn(body, "lastName") || Object.hasOwn(body, "ownerEmail")) {
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    const timeZone = typeof body.timeZone === "string" ? body.timeZone.trim() : "";
    const firstName = Object.hasOwn(body, "firstName") ? (typeof body.firstName === "string" ? body.firstName.trim().replace(/\s+/g, " ") : "") : undefined;
    const lastName = Object.hasOwn(body, "lastName") ? (typeof body.lastName === "string" ? body.lastName.trim().replace(/\s+/g, " ") : "") : undefined;
    const ownerEmail = Object.hasOwn(body, "ownerEmail") ? (typeof body.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "") : undefined;
    const fields = validateCompanyProfileInput({ name, timeZone, firstName, lastName, ownerEmail });
    if (Object.keys(fields).length) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, fields);
    try {
      const company = updateCompanyProfile(companyId, {
        name,
        timeZone,
        firstName,
        lastName,
        ownerEmail,
        actorIdentityId: actor.identityId,
        baseUrl: process.env.APP_BASE_URL || request.nextUrl.origin,
      });
      if (!company) return apiError(404, "RESOURCE_NOT_FOUND", "Company not found.", traceId);
      recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, action: "company.profile_update", targetType: "company", targetId: companyId, companyId, result: "success", metadata: { name, timeZone, ownerDetailsChanged: firstName !== undefined } });
      return apiSuccess({ company }, traceId);
    } catch (error) {
      if (error instanceof Error && (error.message === "COMPANY_NAME_EXISTS" || error.message.includes("ux_company_normalized_name"))) {
        return apiError(409, "COMPANY_NAME_EXISTS", "A company with this name already exists.", traceId, { companyName: "Choose a different Company Name." });
      }
      if (error instanceof Error && error.message === "OWNER_EMAIL_EXISTS") {
        return apiError(409, "OWNER_EMAIL_EXISTS", "That login email is already attached to an account.", traceId, { ownerEmail: "This email address is already in use." });
      }
      if (error instanceof Error && error.message === "OWNER_PROFILE_NOT_EDITABLE") {
        return apiError(409, "OWNER_PROFILE_NOT_EDITABLE", "The Owner's account is already active or linked elsewhere. Owner identity details must be changed from that user's Account settings.", traceId);
      }
      recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, action: "company.profile_update", targetType: "company", targetId: companyId, companyId, result: "failure", metadata: { reason: "update_failed" } });
      return apiError(503, "COMPANY_UPDATE_FAILED", "Company details could not be saved. Please try again.", traceId);
    }
  }

  if (!actor.isPrimaryPlatformAdmin) return apiError(403, "ACTION_FORBIDDEN", "Only the Platform Owner can change a company subscription end date.", traceId);
  const expirationDate = body.expirationDate === null || body.expirationDate === "never" ? null : typeof body.expirationDate === "string" ? body.expirationDate : undefined;
  if (expirationDate !== null && (expirationDate === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(expirationDate) || Number.isNaN(Date.parse(`${expirationDate}T00:00:00Z`)))) return apiError(400, "VALIDATION_FAILED", "Choose a valid expiration date or Never.", traceId);
  const company = updateCompanyExpiration(companyId, expirationDate);
  if (!company) return apiError(404, "RESOURCE_NOT_FOUND", "Company not found.", traceId);
  recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, action: "company.expiration_update", targetType: "company", targetId: companyId, companyId, result: "success", metadata: { expirationDate: expirationDate ?? "never" } });
  return apiSuccess({ company }, traceId);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (actor.contextType !== "platform" || !actor.isPlatformAdmin) return apiError(403, "ACTION_FORBIDDEN", "Platform Administrator access is required.", traceId);
  if (await validateMutationRequest(request, actor)) return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  const companyId = Number((await params).id);
  if (!Number.isInteger(companyId) || companyId <= 0) return apiError(404, "RESOURCE_NOT_FOUND", "Company not found.", traceId);
  const body = await request.json().catch(() => null) as { confirmationName?: unknown } | null;
  if (!body || typeof body.confirmationName !== "string") return apiError(400, "CONFIRMATION_REQUIRED", "Type the company name to confirm retirement.", traceId);
  const existing = getCompanyOperationalMetadata(companyId);
  if (!existing) return apiError(404, "RESOURCE_NOT_FOUND", "Company not found or already deleted.", traceId);
  if (body.confirmationName.trim().toLocaleLowerCase() !== existing.name.trim().toLocaleLowerCase()) {
    return apiError(400, "CONFIRMATION_MISMATCH", "The typed name does not match this company.", traceId, { confirmationName: "Type the exact company name shown above." });
  }
  try {
    const result = deleteCompany({ actor, companyId, requestId: traceId });
    return apiSuccess({ deleted: true, ...result }, traceId);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "COMPANY_NOT_FOUND") return apiError(404, "RESOURCE_NOT_FOUND", "Company not found or already deleted.", traceId);
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, action: "company.delete", targetType: "company", targetId: companyId, companyId, result: "failure", metadata: { reason: "retirement_failed" } });
    return apiError(503, "COMPANY_DELETE_FAILED", "Company access could not be retired. No company data was removed; please try again.", traceId);
  }
}
