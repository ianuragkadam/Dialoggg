import { NextRequest } from "next/server";

import db from "@/db";
import { getCurrentActor, verifyIdentityPassword } from "@/lib/auth";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  createPlatformOauthState,
  platformGoogleConfig,
  platformGoogleSnapshot,
  revokePlatformGoogleConfig,
  savePlatformGoogleConfig,
  setPlatformGoogleEnabled,
} from "@/lib/integration-setup";
import { oauthAuthorizationUrl } from "@/lib/integration-providers";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

const fields = ["projectName", "projectId", "clientId", "supportEmail", "privacyUrl", "privacyStatus"] as const;

function cleanConfig(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(fields.map(key => [key, String(source[key] ?? "").trim().slice(0, 500)]));
}

function validate(config: Record<string, string>, requireSecret: boolean, clientSecret: string) {
  const invalid: Record<string, string> = {};
  for (const key of fields) if (!config[key]) invalid[key] = "Required";
  if (!/^[a-z][a-z0-9-]{4,62}[a-z0-9]$/.test(config.projectId || "")) invalid.projectId = "Enter the Google Cloud project ID.";
  if (!/^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(config.clientId || "")) invalid.clientId = "Enter a Web application OAuth client ID.";
  if (!/^\S+@\S+\.\S+$/.test(config.supportEmail || "")) invalid.supportEmail = "Enter a valid support email.";
  if (!/^https:\/\//i.test(config.privacyUrl || "")) invalid.privacyUrl = "Use an HTTPS privacy-policy URL.";
  if (!['draft', 'published', 'verification_required', 'verified'].includes(config.privacyStatus || "")) invalid.privacyStatus = "Choose the consent-screen status.";
  if (requireSecret && clientSecret.length < 12) invalid.clientSecret = "Enter the OAuth client secret.";
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
  return apiSuccess(platformGoogleSnapshot(), id);
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
      const current = platformGoogleSnapshot();
      const config = cleanConfig(body.config);
      const clientSecret = String((body.secrets as Record<string, unknown> | undefined)?.clientSecret ?? "");
      validate(config, !current.credential.configured, clientSecret);
      savePlatformGoogleConfig({
        environment: body.environment === "test" ? "test" : "production",
        config,
        secrets: clientSecret ? { clientSecret } : undefined,
      });
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, action: current.credential.configured ? "integration_google.rotate" : "integration_google.save", targetType: "integration_config", targetId: "google_platform", result: "success", metadata: { environment: body.environment === "test" ? "test" : "production" } });
      return apiSuccess(platformGoogleSnapshot(), id);
    }

    if (action === "oauth_start" || action === "retry") {
      const saved = platformGoogleConfig(false);
      const oauth = createPlatformOauthState(actor, saved.id);
      const authorizationUrl = oauthAuthorizationUrl({ provider: "google", state: oauth.state, challenge: oauth.challenge, config: saved.config });
      db.prepare("UPDATE integration_config SET safe_status_code = 'VERIFYING', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(saved.id);
      return apiSuccess({ authorizationUrl }, id);
    }

    if (["disable", "enable", "revoke"].includes(action)) {
      if (!await verifyIdentityPassword(actor.identityId, body.currentPassword)) return apiError(403, "REAUTHENTICATION_REQUIRED", "Confirm your current Platform Administrator password.", id);
      if (action === "revoke") revokePlatformGoogleConfig();
      else setPlatformGoogleEnabled(action === "enable");
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, action: `integration_google.${action}`, targetType: "integration_config", targetId: "google_platform", result: "success" });
      return apiSuccess(platformGoogleSnapshot(), id);
    }

    return apiError(400, "ACTION_INVALID", "Choose a valid settings action.", id);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "INTEGRATION_SETTINGS_FAILED";
    const code = /^[A-Z][A-Z0-9_]{2,79}$/.test(raw) ? raw : "INTEGRATION_SETTINGS_FAILED";
    const detail = (error as { fields?: Record<string, string> })?.fields;
    recordAudit({ requestId: id, actorIdentityId: actor.identityId, action: `integration_google.${action || "unknown"}`, targetType: "integration_config", targetId: "google_platform", result: "failure", metadata: { errorCode: code } });
    return apiError(code === "GOOGLE_PLATFORM_DISABLED" ? 409 : 400, code, "Google settings could not be updated.", id, detail);
  }
}
