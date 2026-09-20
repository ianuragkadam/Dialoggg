import { NextRequest } from "next/server";

import db from "@/db";
import { getCurrentActor, verifyIdentityPassword } from "@/lib/auth";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  createPlatformOauthState,
  platformMicrosoftConfig,
  platformMicrosoftSnapshot,
  revokePlatformMicrosoftConfig,
  savePlatformMicrosoftConfig,
  setPlatformMicrosoftEnabled,
} from "@/lib/integration-setup";
import { oauthAuthorizationUrl } from "@/lib/integration-providers";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

const fields = ["applicationName", "tenantId", "clientId", "publisherDomain"] as const;

function cleanConfig(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(fields.map(key => [key, String(source[key] ?? "").trim().slice(0, 500)]));
}

function validate(config: Record<string, string>, requireSecret: boolean, clientSecret: string) {
  const invalid: Record<string, string> = {};
  for (const key of fields) if (!config[key]) invalid[key] = "Required";
  if (!(config.tenantId === "organizations" || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(config.tenantId || ""))) {
    invalid.tenantId = "Enter the Microsoft Entra tenant ID or organizations.";
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(config.clientId || "")) invalid.clientId = "Enter the application (client) ID.";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(config.publisherDomain || "")) invalid.publisherDomain = "Enter a verified publisher domain.";
  if (requireSecret && clientSecret.length < 12) invalid.clientSecret = "Enter the client secret value.";
  if (Object.keys(invalid).length) throw Object.assign(new Error("FIELDS_INVALID"), { fields: invalid });
}

async function platformActor(request: NextRequest) {
  const actor = await getCurrentActor();
  if (!actor?.isPlatformAdmin || actor.contextType !== "platform") return null;
  if (await validateMutationRequest(request, actor)) return null;
  return actor;
}

export async function GET() {
  const id = requestId();
  const actor = await getCurrentActor();
  if (!actor?.isPlatformAdmin || actor.contextType !== "platform") return apiError(403, "PLATFORM_ADMIN_REQUIRED", "Platform Administration is restricted.", id);
  return apiSuccess(platformMicrosoftSnapshot(), id);
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const actor = await platformActor(request);
  if (!actor) return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", id);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError(400, "INVALID_JSON", "Enter valid settings.", id);
  const action = String(body.action ?? "");

  try {
    if (action === "save") {
      if (!await verifyIdentityPassword(actor.identityId, body.currentPassword)) return apiError(403, "REAUTHENTICATION_REQUIRED", "Confirm your current Platform Administrator password.", id);
      const current = platformMicrosoftSnapshot();
      const config = cleanConfig(body.config);
      const clientSecret = String((body.secrets as Record<string, unknown> | undefined)?.clientSecret ?? "");
      validate(config, !current.credential.configured, clientSecret);
      savePlatformMicrosoftConfig({
        environment: body.environment === "test" ? "test" : "production",
        config,
        secrets: clientSecret ? { clientSecret } : undefined,
      });
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, action: current.credential.configured ? "integration_microsoft.rotate" : "integration_microsoft.save", targetType: "integration_config", targetId: "microsoft_platform", result: "success", metadata: { environment: body.environment === "test" ? "test" : "production" } });
      return apiSuccess(platformMicrosoftSnapshot(), id);
    }

    if (action === "oauth_start" || action === "retry") {
      const saved = platformMicrosoftConfig(false);
      const oauth = createPlatformOauthState(actor, saved.id, "microsoft");
      const authorizationUrl = oauthAuthorizationUrl({ provider: "microsoft", state: oauth.state, challenge: oauth.challenge, config: saved.config });
      db.prepare("UPDATE integration_config SET safe_status_code = 'VERIFYING', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(saved.id);
      return apiSuccess({ authorizationUrl }, id);
    }

    if (["disable", "enable", "revoke"].includes(action)) {
      if (!await verifyIdentityPassword(actor.identityId, body.currentPassword)) return apiError(403, "REAUTHENTICATION_REQUIRED", "Confirm your current Platform Administrator password.", id);
      if (action === "revoke") revokePlatformMicrosoftConfig();
      else setPlatformMicrosoftEnabled(action === "enable");
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, action: `integration_microsoft.${action}`, targetType: "integration_config", targetId: "microsoft_platform", result: "success" });
      return apiSuccess(platformMicrosoftSnapshot(), id);
    }

    return apiError(400, "ACTION_INVALID", "Choose a valid settings action.", id);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "INTEGRATION_SETTINGS_FAILED";
    const code = /^[A-Z][A-Z0-9_]{2,79}$/.test(raw) ? raw : "INTEGRATION_SETTINGS_FAILED";
    const detail = (error as { fields?: Record<string, string> })?.fields;
    recordAudit({ requestId: id, actorIdentityId: actor.identityId, action: `integration_microsoft.${action || "unknown"}`, targetType: "integration_config", targetId: "microsoft_platform", result: "failure", metadata: { errorCode: code } });
    return apiError(code === "MICROSOFT_PLATFORM_DISABLED" ? 409 : 400, code, "Microsoft settings could not be updated.", id, detail);
  }
}
