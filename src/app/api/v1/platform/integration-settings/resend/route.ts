import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

import db from "@/db";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { retryEmailDelivery } from "@/lib/email-outbox";
import { IntegrationProviderError, sendResendTest, validateResend } from "@/lib/integration-providers";
import {
  beginValidation,
  finishValidation,
  platformResendConfig,
  platformResendSnapshot,
  revokePlatformResendConfig,
  savePlatformResendConfig,
  setPlatformResendEnabled,
} from "@/lib/integration-setup";
import { validateMutationRequest } from "@/lib/request-security";
import { clientAddressHash, rateLimitStatus, recordAudit, recordRateLimitFailure, requestId } from "@/lib/security";

const fields = ["sendingDomain", "fromName", "fromAddress", "replyTo"] as const;

function cleanConfig(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(fields.map(key => [key, String(source[key] ?? "").trim().slice(0, 500)]));
}

function validate(config: Record<string, string>, requireSecret: boolean, apiKey: string) {
  const invalid: Record<string, string> = {};
  for (const key of fields) if (!config[key]) invalid[key] = "Required";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(config.sendingDomain || "")) invalid.sendingDomain = "Enter a valid verified sending domain.";
  if (!/^\S+@\S+\.\S+$/.test(config.fromAddress || "")) invalid.fromAddress = "Enter a valid From address.";
  if (!/^\S+@\S+\.\S+$/.test(config.replyTo || "")) invalid.replyTo = "Enter a valid Reply-To address.";
  if (config.fromAddress?.split("@")[1]?.toLowerCase() !== config.sendingDomain?.toLowerCase()) invalid.fromAddress = "Use the verified sending domain.";
  if (requireSecret && apiKey.length < 10) invalid.apiKey = "Enter the Resend API key.";
  if (Object.keys(invalid).length) throw Object.assign(new Error("FIELDS_INVALID"), { fields: invalid });
}

async function verifyPassword(identityId: number, value: unknown) {
  const password = String(value ?? "");
  const row = db.prepare("SELECT password_hash FROM identity WHERE id = ? AND status = 'active'").get(identityId) as { password_hash: string } | undefined;
  return !!row && password.length > 0 && await bcrypt.compare(password, row.password_hash);
}

export async function GET() {
  const id = requestId();
  const actor = await getCurrentActor();
  if (!actor?.isPlatformAdmin || actor.contextType !== "platform") return apiError(403, "PLATFORM_ADMIN_REQUIRED", "Platform Administration is restricted.", id);
  return apiSuccess(platformResendSnapshot(), id);
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const actor = await getCurrentActor();
  if (!actor?.isPlatformAdmin || actor.contextType !== "platform" || await validateMutationRequest(request, actor)) {
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", id);
  }
  const limiter = {
    action: "platform_resend_mutation",
    discriminator: `${actor.identityId}:${clientAddressHash(request)}`,
    maximumAttempts: 30,
    windowSeconds: 300,
    blockSeconds: 300,
  };
  const limit = rateLimitStatus(limiter);
  if (!limit.allowed) return apiError(429, "RATE_LIMITED", "Too many email settings attempts. Try again shortly.", id);
  recordRateLimitFailure(limiter, limit.keyHash);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError(400, "INVALID_JSON", "Enter valid settings.", id);
  const action = String(body.action ?? "");

  try {
    if (action === "save") {
      if (!await verifyPassword(actor.identityId, body.currentPassword)) return apiError(403, "REAUTHENTICATION_REQUIRED", "Confirm your current Platform Administrator password.", id);
      const current = platformResendSnapshot();
      const config = cleanConfig(body.config);
      const secrets = body.secrets && typeof body.secrets === "object" ? body.secrets as Record<string, unknown> : {};
      const apiKey = String(secrets.apiKey ?? "");
      const webhookSecret = String(secrets.webhookSecret ?? "");
      validate(config, !current.credential.configured, apiKey);
      const mergedSecrets = apiKey || webhookSecret
        ? {
          ...(current.credential.configured ? platformResendConfig(false).secrets : {}),
          ...(apiKey ? { apiKey } : {}),
          ...(webhookSecret ? { webhookSecret } : {}),
        }
        : undefined;
      savePlatformResendConfig({
        environment: body.environment === "test" ? "test" : "production",
        config,
        secrets: mergedSecrets,
      });
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, action: current.credential.configured ? "integration_resend.rotate" : "integration_resend.save", targetType: "integration_config", targetId: "resend_platform", result: "success", metadata: { environment: body.environment === "test" ? "test" : "production", sendingDomain: config.sendingDomain } });
      return apiSuccess(platformResendSnapshot(), id);
    }

    if (action === "validate" || action === "retry_validation") {
      const saved = platformResendConfig(false);
      const attempt = beginValidation(saved.id, null, "validate", id);
      try {
        const details = await validateResend(saved);
        finishValidation(attempt, saved.id, "passed", null, details);
      } catch (error) {
        const code = error instanceof IntegrationProviderError ? error.code : "RESEND_VALIDATION_FAILED";
        finishValidation(attempt, saved.id, "failed", code);
        throw error;
      }
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, action: "integration_resend.validate", targetType: "integration_config", targetId: saved.id, result: "success" });
      return apiSuccess(platformResendSnapshot(), id);
    }

    if (action === "test_send") {
      const recipient = String(body.recipient ?? "").trim().toLowerCase();
      if (body.confirmed !== true || !/^\S+@\S+\.\S+$/.test(recipient)) return apiError(400, "TEST_EMAIL_CONFIRMATION_REQUIRED", "Explicitly confirm one valid test recipient.", id);
      const saved = platformResendConfig(true);
      const attempt = beginValidation(saved.id, null, "test_email", id);
      try {
        await sendResendTest({ ...saved, recipient, idempotencyKey: `platform-resend-test:${attempt}` });
        finishValidation(attempt, saved.id, "passed", null, { delivery: "accepted" }, false);
      } catch (error) {
        const code = error instanceof IntegrationProviderError ? error.code : "RESEND_TEST_EMAIL_FAILED";
        finishValidation(attempt, saved.id, "failed", code, {}, false);
        throw error;
      }
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, action: "integration_resend.test_email", targetType: "integration_config", targetId: saved.id, result: "success", metadata: { recipientDomain: recipient.split("@")[1] } });
      return apiSuccess(platformResendSnapshot(), id);
    }

    if (["disable", "enable", "revoke", "retry_job"].includes(action)) {
      if (!await verifyPassword(actor.identityId, body.currentPassword)) return apiError(403, "REAUTHENTICATION_REQUIRED", "Confirm your current Platform Administrator password.", id);
      if (action === "revoke") revokePlatformResendConfig();
      else if (action === "disable" || action === "enable") setPlatformResendEnabled(action === "enable");
      else retryEmailDelivery(Number(body.jobId));
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, action: `integration_resend.${action}`, targetType: action === "retry_job" ? "outbox_job" : "integration_config", targetId: action === "retry_job" ? String(body.jobId) : "resend_platform", result: "success" });
      return apiSuccess(platformResendSnapshot(), id);
    }

    return apiError(400, "ACTION_INVALID", "Choose a valid settings action.", id);
  } catch (error) {
    const raw = error instanceof IntegrationProviderError ? error.code : error instanceof Error ? error.message : "RESEND_SETTINGS_FAILED";
    const code = /^[A-Z][A-Z0-9_]{2,79}$/.test(raw) ? raw : "RESEND_SETTINGS_FAILED";
    const detail = (error as { fields?: Record<string, string> })?.fields;
    recordAudit({ requestId: id, actorIdentityId: actor.identityId, action: `integration_resend.${action || "unknown"}`, targetType: "integration_config", targetId: "resend_platform", result: "failure", metadata: { errorCode: code } });
    return apiError(code.includes("DISABLED") || code.includes("VERIFICATION") || code.includes("EXPIRED") ? 409 : 400, code, "Resend settings could not be updated.", id, detail);
  }
}
