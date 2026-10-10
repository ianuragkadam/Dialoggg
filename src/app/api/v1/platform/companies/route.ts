import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import {
  createCompanyWithFirstOwner,
  listCompanyOperationalMetadata,
  validateCreateCompanyInput,
} from "@/lib/company-administration";
import { validateMutationRequest } from "@/lib/request-security";
import { normalizeEmail, recordAudit, requestId } from "@/lib/security";

async function requirePlatformActor(traceId: string) {
  const actor = await getCurrentActor();
  if (!actor) return { error: apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId) } as const;
  if (actor.contextType !== "platform" || !actor.isPlatformAdmin) {
    return { error: apiError(403, "ACTION_FORBIDDEN", "Platform Administrator access is required.", traceId) } as const;
  }
  return { actor } as const;
}

export async function GET(request: NextRequest) {
  const traceId = requestId(request);
  const auth = await requirePlatformActor(traceId);
  if ("error" in auth) return auth.error;
  return apiSuccess({ companies: listCompanyOperationalMetadata() }, traceId);
}

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const auth = await requirePlatformActor(traceId);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, action: "company.create", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId);
  const company = {
    name: typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "",
    timeZone: typeof body.timeZone === "string" ? body.timeZone.trim() : "",
    ownerFirstName: typeof body.ownerFirstName === "string" ? body.ownerFirstName.trim().replace(/\s+/g, " ") : "",
    ownerLastName: typeof body.ownerLastName === "string" ? body.ownerLastName.trim().replace(/\s+/g, " ") : "",
    ownerEmail: normalizeEmail(body.ownerEmail),
  };
  const fields = validateCreateCompanyInput(company);
  if (Object.keys(fields).length) return apiError(400, "VALIDATION_FAILED", "Check the highlighted fields.", traceId, fields);

  try {
    const created = await createCompanyWithFirstOwner({
      actor,
      requestId: traceId,
      baseUrl: process.env.APP_BASE_URL || request.nextUrl.origin,
      company,
    });
    return apiSuccess({
      company: getCreatedCompany(created.companyId),
      firstOwnerMembershipId: created.membershipId,
      invitationExpiresAt: created.invitationExpiresAt,
    }, traceId, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "COMPANY_NAME_EXISTS" || code.includes("ux_company_normalized_name")) {
      return apiError(409, "COMPANY_NAME_EXISTS", "A company with this name already exists.", traceId, {
        companyName: `A company named “${company.name}” already exists.`,
      });
    }
    if (code === "IDENTITY_DEACTIVATED") {
      return apiError(409, "IDENTITY_DEACTIVATED", "The first Owner identity is deactivated and must be restored before it can be invited.", traceId, {
        ownerEmail: "This identity is deactivated.",
      });
    }
    if (code === "EMAIL_ALREADY_IN_USE" || /identity\.normalized_email/i.test(code)) {
      return apiError(409, "EMAIL_ALREADY_IN_USE", "This email is already used by a User or Resource in Dialoggg. Use a different email address.", traceId, {
        ownerEmail: "This email is already in use across the platform.",
      });
    }
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, action: "company.create", result: "failure", metadata: { reason: "creation_failed" } });
    return apiError(503, "COMPANY_CREATION_FAILED", "The company and invitation could not be created.", traceId);
  }
}

function getCreatedCompany(companyId: number) {
  return listCompanyOperationalMetadata().find(company => company.id === companyId) ?? null;
}
