import { NextRequest } from "next/server";

import db from "@/db";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { rotateIntegrationInvitation, type InvitationScope } from "@/lib/integration-setup";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "platform" || !actor.isPlatformAdmin) return apiError(403, "PLATFORM_ADMIN_REQUIRED", "Platform Administrator access is required.", id);
  const invitations = db.prepare(`
    SELECT i.id, i.access_kind, i.scope_kind, i.company_id, c.name AS company_name,
      i.label, i.expires_at, i.revoked_at, i.completed_at, i.last_accessed_at, i.created_at
    FROM integration_setup_invitation i
    LEFT JOIN company c ON c.id = i.company_id
    ORDER BY i.created_at DESC, i.id DESC LIMIT 50
  `).all();
  return apiSuccess({ invitations }, id);
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "platform" || !actor.isPlatformAdmin) return apiError(403, "PLATFORM_ADMIN_REQUIRED", "Platform Administrator access is required.", id);
  const securityError = await validateMutationRequest(request, actor);
  if (securityError) return apiError(403, securityError, "Security check failed.", id);
  let body: any;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Enter valid invitation details.", id); }
  const scopeKind = body.scopeKind as InvitationScope;
  if (scopeKind !== "platform") return apiError(400, "SCOPE_INVALID", "New setup links are platform-provider only. Company Microsoft connections are managed in authenticated company settings.", id);
  const companyId = null;
  if (body.authorizePlatformSecrets !== true) {
    return apiError(400, "PLATFORM_SECRET_AUTHORIZATION_REQUIRED", "Explicitly authorize platform credential access.", id);
  }
  const days = Math.min(30, Math.max(1, Number(body.expiresInDays) || 7));
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  const label = String(body.label ?? "Secure integration setup").trim().slice(0, 120);
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
  if (!base) return apiError(500, "APP_BASE_URL_REQUIRED", "The canonical application URL is not configured.", id);
  const workshopTokenHash = String(body.workshopTokenHash ?? "").toLowerCase();
  const reviewTokenHash = String(body.reviewTokenHash ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(workshopTokenHash) || !/^[a-f0-9]{64}$/.test(reviewTokenHash) || workshopTokenHash === reviewTokenHash) {
    return apiError(400, "INVITATION_HASH_INVALID", "Generate two fresh private invitation links.", id);
  }
  const pair = rotateIntegrationInvitation({ scopeKind, companyId, label, expiresAt, createdByIdentityId: actor.identityId, workshopTokenHash, reviewTokenHash });
  recordAudit({ requestId: id, actorIdentityId: actor.identityId, action: "integration_invitation.rotate", targetType: "integration_setup_invitation", targetId: pair.workshop.id, result: "success", metadata: { scopeKind, companyId, expiresInDays: days } });
  return apiSuccess({
    baseUrl: base,
    expiresAt,
  }, id, { status: 201 });
}
