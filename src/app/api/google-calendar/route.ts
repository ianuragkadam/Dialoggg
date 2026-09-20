import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import {
  createGoogleOauthState,
  disconnectGoogle,
  GoogleCalendarError,
  googleConnectionSnapshot,
  processGoogleOutbox,
  resumeGoogle,
  retryGoogle,
} from "@/lib/google-calendar";
import { oauthAuthorizationUrl } from "@/lib/integration-providers";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

export async function GET() {
  const id = requestId();
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", id);
  if (actor.contextType !== "company") return apiError(403, "COMPANY_CONTEXT_REQUIRED", "Switch to a Company before managing personal Google Calendar delivery.", id);
  try {
    return apiSuccess(googleConnectionSnapshot(actor), id);
  } catch (error) {
    const domain = error instanceof GoogleCalendarError ? error : new GoogleCalendarError("GOOGLE_STATUS_FAILED", "transient", 503);
    return apiError(domain.status, domain.code, "Google Calendar status is temporarily unavailable.", id);
  }
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", id);
  if (actor.contextType !== "company" || !actor.companyId) return apiError(403, "COMPANY_CONTEXT_REQUIRED", "Switch to a Company before managing personal Google Calendar delivery.", id);
  if (await validateMutationRequest(request, actor)) return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", id);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError(400, "INVALID_JSON", "Choose a Google Calendar action.", id);
  const action = String(body.action ?? "");

  try {
    if (action === "oauth_start") {
      const oauth = createGoogleOauthState(actor);
      const authorizationUrl = oauthAuthorizationUrl({ provider: "google", state: oauth.state, challenge: oauth.challenge, config: oauth.config });
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "google_calendar.connect_start", targetType: "google_connection", result: "success" });
      return apiSuccess({ authorizationUrl }, id);
    }
    if (action === "disconnect") {
      if (body.confirmed !== true || !["remove", "retain"].includes(String(body.mode))) return apiError(400, "DISCONNECT_CONFIRMATION_REQUIRED", "Choose what happens to managed Google items and confirm disconnection.", id);
      const mode = String(body.mode) as "remove" | "retain";
      await disconnectGoogle(actor, mode);
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "google_calendar.disconnect", targetType: "google_connection", result: "success", metadata: { mode } });
      return apiSuccess(googleConnectionSnapshot(actor), id);
    }
    if (action === "resume") {
      if (body.confirmed !== true) return apiError(400, "RESUME_CONFIRMATION_REQUIRED", "Confirm synchronization resume after reviewing connection health.", id);
      resumeGoogle(actor);
      await processGoogleOutbox(25);
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "google_calendar.resume", targetType: "google_connection", result: "success" });
      return apiSuccess(googleConnectionSnapshot(actor), id);
    }
    if (action === "retry" || action === "sync_now") {
      const connectionId = retryGoogle(actor);
      const processed = await processGoogleOutbox(25, connectionId);
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: `google_calendar.${action}`, targetType: "google_connection", targetId: connectionId, result: "success", metadata: processed });
      return apiSuccess(googleConnectionSnapshot(actor), id);
    }
    return apiError(400, "ACTION_INVALID", "Choose a valid Google Calendar action.", id);
  } catch (error) {
    const domain = error instanceof GoogleCalendarError
      ? error
      : new GoogleCalendarError(error instanceof Error && /^[A-Z][A-Z0-9_]{2,79}$/.test(error.message) ? error.message : "GOOGLE_ACTION_FAILED", "transient", 503);
    recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: `google_calendar.${action || "unknown"}`, targetType: "google_connection", result: "failure", metadata: { errorCode: domain.code } });
    const message = domain.kind === "authorization" ? "Reconnect Google Calendar to continue." : domain.kind === "permission" ? "Google permission is missing. Reconnect and approve the requested scope." : domain.kind === "transient" ? "Google is temporarily unavailable. The change will be retried." : "Google Calendar could not complete that action.";
    return apiError(domain.status, domain.code, message, id);
  }
}
