import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import {
  createMicrosoftOauthState,
  disconnectMicrosoft,
  listMicrosoftRootChoices,
  microsoftConnectionSnapshot,
  MicrosoftStorageError,
  retryMicrosoftConnection,
  selectMicrosoftRoot,
} from "@/lib/microsoft-storage";
import { oauthAuthorizationUrl } from "@/lib/integration-providers";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

function message(error: MicrosoftStorageError) {
  if (error.kind === "authorization") return "Connect or reconnect Microsoft Storage to continue.";
  if (error.kind === "permission") return "Microsoft permission is missing. Reconnect and approve the requested scope.";
  if (error.kind === "transient") return "Microsoft Graph is temporarily unavailable. Try again.";
  return "Microsoft Storage could not complete that action.";
}

export async function GET() {
  const id = requestId();
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", id);
  try { return apiSuccess(microsoftConnectionSnapshot(actor), id); }
  catch (error) {
    const domain = error instanceof MicrosoftStorageError ? error : new MicrosoftStorageError("MICROSOFT_STATUS_FAILED", "transient", 503);
    return apiError(domain.status, domain.code, message(domain), id);
  }
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", id);
  if (await validateMutationRequest(request, actor)) return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", id);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError(400, "INVALID_JSON", "Choose a Microsoft Storage action.", id);
  const action = String(body.action ?? "");

  try {
    if (action === "oauth_start") {
      const serviceType = body.serviceType === "sharepoint" ? "sharepoint" as const : "onedrive_business" as const;
      const oauth = createMicrosoftOauthState(actor, {
        serviceType,
        sharepointHost: String(body.sharepointHost ?? "").trim(),
        sharepointPath: String(body.sharepointPath ?? "").trim(),
      });
      const authorizationUrl = oauthAuthorizationUrl({ provider: "microsoft", state: oauth.state, challenge: oauth.challenge, config: oauth.config });
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "microsoft_storage.connect_start", targetType: "microsoft_connection", result: "success", metadata: { serviceType } });
      return apiSuccess({ authorizationUrl }, id);
    }
    if (action === "root_choices") return apiSuccess({ choices: await listMicrosoftRootChoices(actor) }, id);
    if (action === "select_root") {
      if (body.confirmed !== true || typeof body.choice !== "string") return apiError(400, "ROOT_CHANGE_CONFIRMATION_REQUIRED", "Choose a future folder root and confirm that existing Project folders will not move.", id);
      const result = await selectMicrosoftRoot(actor, body.choice);
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "microsoft_storage.root_change", targetType: "microsoft_connection", result: "success" });
      return apiSuccess(result, id);
    }
    if (action === "disconnect") {
      if (body.confirmed !== true) return apiError(400, "DISCONNECT_CONFIRMATION_REQUIRED", "Confirm that Microsoft folders remain in Microsoft 365 while Dialoggg links are disabled.", id);
      const result = disconnectMicrosoft(actor);
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "microsoft_storage.disconnect", targetType: "microsoft_connection", result: "success" });
      return apiSuccess(result, id);
    }
    if (action === "retry") {
      const result = await retryMicrosoftConnection(actor);
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "microsoft_storage.retry", targetType: "microsoft_connection", result: "success" });
      return apiSuccess(result, id);
    }
    return apiError(400, "ACTION_INVALID", "Choose a valid Microsoft Storage action.", id);
  } catch (error) {
    const domain = error instanceof MicrosoftStorageError ? error : new MicrosoftStorageError("MICROSOFT_ACTION_FAILED", "transient", 503);
    recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: `microsoft_storage.${action || "unknown"}`, targetType: "microsoft_connection", result: "failure", metadata: { errorCode: domain.code } });
    return apiError(domain.status, domain.code, message(domain), id);
  }
}
