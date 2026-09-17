import { NextRequest, NextResponse } from "next/server";

import {
  beginValidation,
  configForProvider,
  consumeOauthState,
  finishValidation,
  INTEGRATION_SESSION_COOKIE,
} from "@/lib/integration-setup";
import { IntegrationProviderError, verifyOauthProvider } from "@/lib/integration-providers";
import { recordAudit, requestId } from "@/lib/security";

function redirectResult(provider: "google" | "microsoft", status: "verified" | "action_required" | "invalid") {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") || "http://localhost:3030";
  const response = NextResponse.redirect(`${base}/integration-setup#oauth=${provider}&status=${status}`, 303);
  response.headers.set("cache-control", "no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const id = requestId(request);
  const route = (await params).provider;
  if (route !== "google" && route !== "microsoft") return redirectResult("google", "invalid");
  const state = request.nextUrl.searchParams.get("state") || "";
  const consumed = consumeOauthState(state, request.cookies.get(INTEGRATION_SESSION_COOKIE)?.value, route);
  if (!consumed) return redirectResult(route, "invalid");

  const provider = route === "google" ? "google_platform" : "microsoft_company";
  let saved: ReturnType<typeof configForProvider>;
  try {
    saved = configForProvider(consumed.session, provider);
    if (saved.id !== consumed.configId) throw new Error("OAUTH_CONFIG_MISMATCH");
  } catch {
    return redirectResult(route, "invalid");
  }
  const attempt = beginValidation(saved.id, consumed.session.id, "oauth", id);
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");
  if (!code || providerError) {
    finishValidation(attempt, saved.id, "failed", "OAUTH_AUTHORIZATION_REJECTED");
    recordAudit({ requestId: id, companyId: consumed.session.company_id, action: `integration_${route}.oauth`, targetType: "integration_config", targetId: saved.id, result: "failure", metadata: { errorCode: "OAUTH_AUTHORIZATION_REJECTED" } });
    return redirectResult(route, "action_required");
  }

  try {
    const details = await verifyOauthProvider({
      provider: route,
      code,
      verifier: consumed.verifier,
      config: saved.config,
      secrets: saved.secrets,
    });
    finishValidation(attempt, saved.id, "passed", null, details);
    recordAudit({ requestId: id, companyId: consumed.session.company_id, action: `integration_${route}.oauth`, targetType: "integration_config", targetId: saved.id, result: "success" });
    return redirectResult(route, "verified");
  } catch (error) {
    const errorCode = error instanceof IntegrationProviderError ? error.code : "OAUTH_CAPABILITY_CHECK_FAILED";
    finishValidation(attempt, saved.id, "failed", errorCode);
    recordAudit({ requestId: id, companyId: consumed.session.company_id, action: `integration_${route}.oauth`, targetType: "integration_config", targetId: saved.id, result: "failure", metadata: { errorCode } });
    return redirectResult(route, "action_required");
  }
}
