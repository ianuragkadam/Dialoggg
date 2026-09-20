import { NextRequest, NextResponse } from "next/server";

import { getCurrentActor } from "@/lib/auth";
import {
  beginValidation,
  configForProvider,
  consumeOauthState,
  consumePlatformOauthState,
  finishValidation,
  INTEGRATION_SESSION_COOKIE,
  platformGoogleConfig,
} from "@/lib/integration-setup";
import {
  completeGoogleAuthorization,
  consumeGoogleOauthState,
  GoogleCalendarError,
  markGoogleConnectionFailure,
  processGoogleOutbox,
} from "@/lib/google-calendar";
import { IntegrationProviderError, verifyOauthProvider } from "@/lib/integration-providers";
import { recordAudit, requestId } from "@/lib/security";

function redirectPath(path: string, status: "verified" | "action_required" | "invalid") {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") || "http://localhost:3030";
  const joiner = path.includes("?") ? "&" : "?";
  const response = NextResponse.redirect(`${base}${path}${joiner}status=${status}`, 303);
  response.headers.set("cache-control", "no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

function workshopRedirect(provider: "google" | "microsoft", status: "verified" | "action_required" | "invalid") {
  return redirectPath(`/integration-setup?oauth=${provider}`, status);
}

function safeOauthCode(error: unknown) {
  if (error instanceof GoogleCalendarError || error instanceof IntegrationProviderError) return error.code;
  return "OAUTH_CAPABILITY_CHECK_FAILED";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const id = requestId(request);
  const route = (await params).provider;
  if (route !== "google" && route !== "microsoft") return workshopRedirect("google", "invalid");
  const state = request.nextUrl.searchParams.get("state") || "";
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");
  const actor = await getCurrentActor();

  if (route === "google") {
    const userOauth = consumeGoogleOauthState(state, actor);
    if (userOauth) {
      if (!code || providerError) {
        markGoogleConnectionFailure(userOauth.actor, "OAUTH_AUTHORIZATION_REJECTED", "authorization");
        recordAudit({ requestId: id, actorIdentityId: userOauth.actor.identityId, actorMembershipId: userOauth.actor.membershipId, companyId: userOauth.actor.companyId, action: "google_calendar.oauth", targetType: "google_connection", result: "failure", metadata: { errorCode: "OAUTH_AUTHORIZATION_REJECTED" } });
        return redirectPath("/account/google-calendar?oauth=google", "action_required");
      }
      try {
        const connected = await completeGoogleAuthorization({ actor: userOauth.actor, code, verifier: userOauth.verifier });
        await processGoogleOutbox(25, connected.connectionId);
        recordAudit({ requestId: id, actorIdentityId: userOauth.actor.identityId, actorMembershipId: userOauth.actor.membershipId, companyId: userOauth.actor.companyId, action: "google_calendar.oauth", targetType: "google_connection", targetId: connected.connectionId, result: "success" });
        return redirectPath("/account/google-calendar?oauth=google", "verified");
      } catch (error) {
        const errorCode = safeOauthCode(error);
        const kind = error instanceof GoogleCalendarError ? error.kind : errorCode === "PROVIDER_UNREACHABLE" ? "transient" : "authorization";
        markGoogleConnectionFailure(userOauth.actor, errorCode, kind);
        recordAudit({ requestId: id, actorIdentityId: userOauth.actor.identityId, actorMembershipId: userOauth.actor.membershipId, companyId: userOauth.actor.companyId, action: "google_calendar.oauth", targetType: "google_connection", result: "failure", metadata: { errorCode } });
        return redirectPath("/account/google-calendar?oauth=google", "action_required");
      }
    }

    const platformOauth = consumePlatformOauthState(state, actor);
    if (platformOauth) {
      let saved: ReturnType<typeof platformGoogleConfig>;
      try {
        saved = platformGoogleConfig(false);
        if (saved.id !== platformOauth.configId) throw new Error("OAUTH_CONFIG_MISMATCH");
      } catch {
        return redirectPath("/platform/integration-setup?oauth=google", "invalid");
      }
      const attempt = beginValidation(saved.id, null, "oauth", id);
      if (!code || providerError) {
        finishValidation(attempt, saved.id, "failed", "OAUTH_AUTHORIZATION_REJECTED");
        recordAudit({ requestId: id, actorIdentityId: actor?.identityId, action: "integration_google.oauth", targetType: "integration_config", targetId: saved.id, result: "failure", metadata: { errorCode: "OAUTH_AUTHORIZATION_REJECTED" } });
        return redirectPath("/platform/integration-setup?oauth=google", "action_required");
      }
      try {
        const details = await verifyOauthProvider({ provider: "google", code, verifier: platformOauth.verifier, config: saved.config, secrets: saved.secrets });
        finishValidation(attempt, saved.id, "passed", null, details);
        recordAudit({ requestId: id, actorIdentityId: actor?.identityId, action: "integration_google.oauth", targetType: "integration_config", targetId: saved.id, result: "success" });
        return redirectPath("/platform/integration-setup?oauth=google", "verified");
      } catch (error) {
        const errorCode = safeOauthCode(error);
        finishValidation(attempt, saved.id, "failed", errorCode);
        recordAudit({ requestId: id, actorIdentityId: actor?.identityId, action: "integration_google.oauth", targetType: "integration_config", targetId: saved.id, result: "failure", metadata: { errorCode } });
        return redirectPath("/platform/integration-setup?oauth=google", "action_required");
      }
    }
  }

  const consumed = consumeOauthState(state, request.cookies.get(INTEGRATION_SESSION_COOKIE)?.value, route);
  if (!consumed) return workshopRedirect(route, "invalid");
  const provider = route === "google" ? "google_platform" : "microsoft_company";
  let saved: ReturnType<typeof configForProvider>;
  try {
    saved = configForProvider(consumed.session, provider);
    if (saved.id !== consumed.configId) throw new Error("OAUTH_CONFIG_MISMATCH");
  } catch {
    return workshopRedirect(route, "invalid");
  }
  const attempt = beginValidation(saved.id, consumed.session.id, "oauth", id);
  if (!code || providerError) {
    finishValidation(attempt, saved.id, "failed", "OAUTH_AUTHORIZATION_REJECTED");
    recordAudit({ requestId: id, companyId: consumed.session.company_id, action: `integration_${route}.oauth`, targetType: "integration_config", targetId: saved.id, result: "failure", metadata: { errorCode: "OAUTH_AUTHORIZATION_REJECTED" } });
    return workshopRedirect(route, "action_required");
  }

  try {
    const details = await verifyOauthProvider({ provider: route, code, verifier: consumed.verifier, config: saved.config, secrets: saved.secrets });
    finishValidation(attempt, saved.id, "passed", null, details);
    recordAudit({ requestId: id, companyId: consumed.session.company_id, action: `integration_${route}.oauth`, targetType: "integration_config", targetId: saved.id, result: "success" });
    return workshopRedirect(route, "verified");
  } catch (error) {
    const errorCode = safeOauthCode(error);
    finishValidation(attempt, saved.id, "failed", errorCode);
    recordAudit({ requestId: id, companyId: consumed.session.company_id, action: `integration_${route}.oauth`, targetType: "integration_config", targetId: saved.id, result: "failure", metadata: { errorCode } });
    return workshopRedirect(route, "action_required");
  }
}
