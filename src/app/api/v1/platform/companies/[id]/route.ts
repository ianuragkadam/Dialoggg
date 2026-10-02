import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { getCompanyOperationalMetadata, updateCompanyExpiration } from "@/lib/company-administration";
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
  if (actor.contextType !== "platform" || !actor.isPrimaryPlatformAdmin) return apiError(403, "ACTION_FORBIDDEN", "Only the Platform Owner can change a company subscription end date.", traceId);
  const companyId = Number((await params).id);
  if (!Number.isInteger(companyId) || companyId <= 0) return apiError(404, "RESOURCE_NOT_FOUND", "Company not found.", traceId);
  const body = await request.json().catch(() => null) as { expirationDate?: unknown } | null;
  const expirationDate = body?.expirationDate === null || body?.expirationDate === "never" ? null : typeof body?.expirationDate === "string" ? body.expirationDate : undefined;
  if (expirationDate !== null && (expirationDate === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(expirationDate) || Number.isNaN(Date.parse(`${expirationDate}T00:00:00Z`)))) return apiError(400, "VALIDATION_FAILED", "Choose a valid expiration date or Never.", traceId);
  const company = updateCompanyExpiration(companyId, expirationDate);
  if (!company) return apiError(404, "RESOURCE_NOT_FOUND", "Company not found.", traceId);
  recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, action: "company.expiration_update", targetType: "company", targetId: companyId, companyId, result: "success", metadata: { expirationDate: expirationDate ?? "never" } });
  return apiSuccess({ company }, traceId);
}
