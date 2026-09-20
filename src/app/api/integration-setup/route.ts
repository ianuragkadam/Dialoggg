import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  autosaveIntegrationConfig,
  beginValidation,
  completeIntegrationWorkshop,
  configForProvider,
  createOauthState,
  finishValidation,
  INTEGRATION_CSRF_COOKIE,
  INTEGRATION_PROVIDERS,
  INTEGRATION_SESSION_COOKIE,
  integrationSession,
  integrationSnapshot,
  revokeIntegrationProvider,
  saveIntegrationConfig,
  validateIntegrationMutation,
  type IntegrationProvider,
} from "@/lib/integration-setup";
import { oauthAuthorizationUrl, sendResendTest, validateResend, IntegrationProviderError } from "@/lib/integration-providers";
import { clientAddressHash, rateLimitStatus, recordAudit, recordRateLimitFailure, requestId } from "@/lib/security";

function sessionFor(request: NextRequest) {
  return integrationSession(request.cookies.get(INTEGRATION_SESSION_COOKIE)?.value);
}

function providerFrom(value: unknown): IntegrationProvider | null {
  return typeof value === "string" && INTEGRATION_PROVIDERS.includes(value as IntegrationProvider) ? value as IntegrationProvider : null;
}

function cleanRecord(value: unknown, allowed: string[], maximumLength = 500) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(allowed.filter(key => Object.hasOwn(value, key)).map(key => [key, String((value as any)[key] ?? "").slice(0, maximumLength)]));
}

function validateProviderInput(provider: IntegrationProvider, config: Record<string, string>, secrets: Record<string, string>, requireSecret: boolean) {
  const missing: string[] = [];
  if (provider === "google_platform") {
    for (const key of ["projectName", "projectId", "clientId", "supportEmail", "privacyUrl", "privacyStatus"]) if (!config[key]?.trim()) missing.push(key);
    if (requireSecret && !secrets.clientSecret) missing.push("clientSecret");
  } else if (provider === "microsoft_platform") {
    for (const key of ["applicationName", "tenantId", "clientId", "publisherDomain"]) if (!config[key]?.trim()) missing.push(key);
    if (requireSecret && !secrets.clientSecret) missing.push("clientSecret");
  } else if (provider === "microsoft_company") {
    for (const key of ["tenantId", "clientId"]) if (!config[key]?.trim()) missing.push(key);
    if (requireSecret && !secrets.clientSecret) missing.push("clientSecret");
  } else {
    for (const key of ["sendingDomain", "fromName", "fromAddress", "replyTo"]) if (!config[key]?.trim()) missing.push(key);
    if (requireSecret && !secrets.apiKey) missing.push("apiKey");
  }
  if (missing.length) throw Object.assign(new Error("FIELDS_REQUIRED"), { fields: missing });
  if (config.supportEmail && !/^\S+@\S+\.\S+$/.test(config.supportEmail)) throw Object.assign(new Error("FIELDS_INVALID"), { fields: ["supportEmail"] });
  if (config.fromAddress && !/^\S+@\S+\.\S+$/.test(config.fromAddress)) throw Object.assign(new Error("FIELDS_INVALID"), { fields: ["fromAddress"] });
  if (config.replyTo && !/^\S+@\S+\.\S+$/.test(config.replyTo)) throw Object.assign(new Error("FIELDS_INVALID"), { fields: ["replyTo"] });
  if (config.privacyUrl && !/^https:\/\//i.test(config.privacyUrl)) throw Object.assign(new Error("FIELDS_INVALID"), { fields: ["privacyUrl"] });
}

function fieldsFor(provider: IntegrationProvider) {
  if (provider === "google_platform") return ["projectName", "projectId", "clientId", "supportEmail", "privacyUrl", "privacyStatus"];
  if (provider === "microsoft_platform") return ["applicationName", "tenantId", "clientId", "publisherDomain"];
  if (provider === "microsoft_company") return ["tenantId", "clientId", "credentialMode", "certificateThumbprint", "storageMode", "rootName", "sharepointHost", "sharepointPath"];
  return ["sendingDomain", "fromName", "fromAddress", "replyTo"];
}

function secretFieldsFor(provider: IntegrationProvider) {
  if (provider === "resend_platform") return ["apiKey", "webhookSecret"];
  if (provider === "microsoft_company") return ["clientSecret", "certificate"];
  return ["clientSecret"];
}

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const session = sessionFor(request);
  if (!session || session.access_kind !== "workshop") return apiError(401, "WORKSHOP_SESSION_REQUIRED", "Open the private workshop invitation.", id);
  return apiSuccess(integrationSnapshot(session), id);
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const session = sessionFor(request);
  if (!session || session.access_kind !== "workshop") return apiError(401, "WORKSHOP_SESSION_REQUIRED", "Open the private workshop invitation.", id);
  const csrf = request.cookies.get(INTEGRATION_CSRF_COOKIE)?.value;
  const securityError = validateIntegrationMutation(request, session, csrf);
  if (securityError) return apiError(403, securityError, "Security check failed.", id);

  const limiter = {
    action: "integration_workshop_mutation",
    discriminator: `${session.id}:${clientAddressHash(request)}`,
    maximumAttempts: 40,
    windowSeconds: 300,
    blockSeconds: 300,
  };
  const limit = rateLimitStatus(limiter);
  if (!limit.allowed) return apiError(429, "RATE_LIMITED", "Too many setup attempts. Try again shortly.", id);
  recordRateLimitFailure(limiter, limit.keyHash);

  let body: any;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Enter valid setup values.", id); }
  const action = typeof body.action === "string" ? body.action : "";
  const provider = providerFrom(body.provider);

  try {
    if (action === "complete") {
      completeIntegrationWorkshop(session);
      recordAudit({ requestId: id, companyId: session.company_id, action: "integration_workshop.complete", targetType: "integration_setup_invitation", targetId: session.id, result: "success" });
      return apiSuccess(integrationSnapshot(session), id);
    }
    if (!provider) return apiError(400, "PROVIDER_REQUIRED", "Choose an integration provider.", id);
    const config = cleanRecord(body.config, fieldsFor(provider));
    const secrets = cleanRecord(body.secrets, secretFieldsFor(provider), 10_000);
    if (provider === "google_platform" && !config.privacyStatus) config.privacyStatus = "draft";
    if (provider === "microsoft_company" && !config.credentialMode) config.credentialMode = "client_secret";
    if (provider === "microsoft_company" && !config.storageMode) config.storageMode = "onedrive";
    if (provider === "microsoft_company" && config.credentialMode === "certificate") delete secrets.clientSecret;
    if (provider === "microsoft_company" && config.credentialMode !== "certificate") delete secrets.certificate;
    const environment = body.environment === "test" ? "test" : "production";

    if (action === "autosave") {
      autosaveIntegrationConfig({ session, provider, environment, config });
      return apiSuccess(integrationSnapshot(session), id);
    }
    if (action === "save") {
      const current = integrationSnapshot(session).providers.find(item => item.provider === provider);
      const credentialModeChanged = provider === "microsoft_company" && current?.credential.configured
        && (current.config.credentialMode || "client_secret") !== config.credentialMode;
      validateProviderInput(provider, config, secrets, !current?.credential.configured || credentialModeChanged);
      saveIntegrationConfig({ session, provider, environment, config, secrets });
      recordAudit({ requestId: id, companyId: session.company_id, action: current?.credential.configured ? "integration_credential.replace" : "integration_credential.save", targetType: "integration_config", targetId: provider, result: "success", metadata: { provider, environment } });
      return apiSuccess(integrationSnapshot(session), id);
    }
    if (action === "oauth_start" && provider !== "resend_platform") {
      const saved = configForProvider(session, provider);
      validateProviderInput(provider, saved.config, {}, false);
      const oauthProvider = provider === "google_platform" ? "google" : "microsoft";
      const oauth = createOauthState({ session, configId: saved.id, provider: oauthProvider });
      const authorizationUrl = oauthAuthorizationUrl({ provider: oauthProvider, state: oauth.state, challenge: oauth.challenge, config: saved.config });
      return apiSuccess({ authorizationUrl }, id);
    }
    if (action === "validate" && provider === "resend_platform") {
      const saved = configForProvider(session, provider);
      const attempt = beginValidation(saved.id, session.id, "validate", id);
      try {
        const details = await validateResend(saved);
        finishValidation(attempt, saved.id, "passed", null, details);
      } catch (error) {
        const code = error instanceof IntegrationProviderError ? error.code : "RESEND_VALIDATION_FAILED";
        finishValidation(attempt, saved.id, "failed", code);
        throw error;
      }
      recordAudit({ requestId: id, companyId: session.company_id, action: "integration_resend.validate", targetType: "integration_config", targetId: saved.id, result: "success" });
      return apiSuccess(integrationSnapshot(session), id);
    }
    if (action === "send_test" && provider === "resend_platform") {
      const recipient = String(body.recipient ?? "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(recipient) || body.confirmed !== true) return apiError(400, "TEST_EMAIL_CONFIRMATION_REQUIRED", "Confirm a valid test recipient.", id);
      const saved = configForProvider(session, provider);
      if (saved.status !== "verified") return apiError(409, "RESEND_VERIFICATION_REQUIRED", "Verify Resend before sending a test.", id);
      const attempt = beginValidation(saved.id, session.id, "test_email", id);
      try {
        await sendResendTest({ ...saved, recipient, idempotencyKey: `integration-test:${attempt}` });
        finishValidation(attempt, saved.id, "passed", null, { delivery: "accepted" }, false);
      } catch (error) {
        const code = error instanceof IntegrationProviderError ? error.code : "RESEND_TEST_EMAIL_FAILED";
        finishValidation(attempt, saved.id, "failed", code, {}, false);
        throw error;
      }
      recordAudit({ requestId: id, companyId: session.company_id, action: "integration_resend.test_email", targetType: "integration_config", targetId: saved.id, result: "success", metadata: { recipientDomain: recipient.split("@")[1] } });
      return apiSuccess(integrationSnapshot(session), id);
    }
    if (action === "revoke") {
      revokeIntegrationProvider(session, provider);
      recordAudit({ requestId: id, companyId: session.company_id, action: "integration_credential.revoke", targetType: "integration_config", targetId: provider, result: "success", metadata: { provider } });
      return apiSuccess(integrationSnapshot(session), id);
    }
    return apiError(400, "ACTION_INVALID", "Choose a valid setup action.", id);
  } catch (error) {
    const rawCode = error instanceof IntegrationProviderError ? error.code : error instanceof Error ? error.message : "INTEGRATION_SETUP_FAILED";
    const code = /^[A-Z][A-Z0-9_]{2,79}$/.test(rawCode) ? rawCode : "INTEGRATION_SETUP_FAILED";
    const fields = Array.isArray((error as any)?.fields) ? Object.fromEntries((error as any).fields.map((field: string) => [field, "Required or invalid"] as const)) : undefined;
    recordAudit({ requestId: id, companyId: session.company_id, action: `integration_setup.${action || "unknown"}`, targetType: "integration_config", targetId: provider, result: "failure", metadata: { provider: provider ?? "unknown", errorCode: code } });
    return apiError(code === "PROVIDER_SCOPE_FORBIDDEN" ? 403 : 400, code, "The provider could not be updated. Check the highlighted setup values and try again.", id, fields);
  }
}
