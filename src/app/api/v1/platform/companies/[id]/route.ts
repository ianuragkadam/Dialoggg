import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { getCompanyOperationalMetadata } from "@/lib/company-administration";
import { requestId } from "@/lib/security";

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
