import "server-only";

import { createSign, randomBytes } from "node:crypto";

import { callbackUri } from "@/lib/integration-setup";

export class IntegrationProviderError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function fakeMode() {
  return process.env.INTEGRATION_PROVIDER_MODE === "fake";
}

export function integrationProviderIsFake() {
  return fakeMode();
}

async function providerJson(url: string, init: RequestInit, failureCode: string) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    throw new IntegrationProviderError("PROVIDER_UNREACHABLE");
  }
  if (!response.ok) throw new IntegrationProviderError(`${failureCode}_${response.status}`);
  try { return await response.json() as any; } catch { throw new IntegrationProviderError("PROVIDER_RESPONSE_INVALID"); }
}

export function oauthAuthorizationUrl(input: {
  provider: "google" | "microsoft";
  state: string;
  challenge: string;
  config: Record<string, string>;
}) {
  if (fakeMode()) {
    const url = new URL(callbackUri(input.provider));
    url.searchParams.set("state", input.state);
    const behavior = ["deny", "missing-scope", "provider-outage", "wrong-callback"].find(item => input.config.clientId?.includes(item));
    url.searchParams.set("code", behavior ? `fake-${behavior}` : "fake-success");
    return url.toString();
  }
  if (input.provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: input.config.clientId,
      redirect_uri: callbackUri("google"),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.app.created",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: input.state,
      code_challenge: input.challenge,
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }
  const tenant = input.config.tenantId || "organizations";
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: input.config.clientId,
    redirect_uri: callbackUri("microsoft"),
    response_type: "code",
    response_mode: "query",
    scope: "openid profile offline_access User.Read Files.ReadWrite",
    prompt: "select_account",
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export type GoogleTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
  expiresIn: number;
};

export async function exchangeGoogleAuthorization(code: string, verifier: string, config: Record<string, string>, secrets: Record<string, string>): Promise<GoogleTokenSet> {
  if (fakeMode()) {
    if (code === "fake-deny" || code === "fake-denied") throw new IntegrationProviderError("OAUTH_AUTHORIZATION_REJECTED");
    if (code === "fake-provider-outage") throw new IntegrationProviderError("PROVIDER_UNREACHABLE");
    if (code === "fake-wrong-callback") throw new IntegrationProviderError("GOOGLE_REDIRECT_URI_MISMATCH");
    return {
      accessToken: "fake-access-token",
      refreshToken: "fake-refresh-token",
      scope: code === "fake-missing-scope" ? "openid" : "https://www.googleapis.com/auth/calendar.app.created",
      expiresIn: 3600,
    };
  }
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: secrets.clientSecret,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: callbackUri("google"),
  });
  const result = await providerJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  }, "GOOGLE_TOKEN_REJECTED");
  if (!result.access_token) throw new IntegrationProviderError("GOOGLE_TOKEN_MISSING");
  return {
    accessToken: String(result.access_token),
    refreshToken: result.refresh_token ? String(result.refresh_token) : null,
    scope: String(result.scope || ""),
    expiresIn: Number(result.expires_in || 0),
  };
}

export function requireGoogleScope(scope: string) {
  const scopes = new Set(scope.split(/\s+/).filter(Boolean));
  if (!scopes.has("https://www.googleapis.com/auth/calendar.app.created")) {
    throw new IntegrationProviderError("GOOGLE_SCOPE_MISSING");
  }
}

export async function verifyGoogleCapability(accessToken: string) {
  if (fakeMode()) return { calendar: "Temporary Dialoggg verification calendar", capability: "calendar.app.created" };
  const headers = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
  const calendar = await providerJson("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers,
    body: JSON.stringify({ summary: "Dialoggg configuration verification", description: "Temporary capability check. Deleted immediately." }),
  }, "GOOGLE_CALENDAR_CREATE_REJECTED");
  if (!calendar?.id) throw new IntegrationProviderError("GOOGLE_CALENDAR_MISSING");
  await providerJson(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}`, { headers }, "GOOGLE_CAPABILITY_REJECTED");
  let deleted: Response;
  try {
    deleted = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}`, {
      method: "DELETE", headers, cache: "no-store",
    });
  } catch {
    throw new IntegrationProviderError("PROVIDER_UNREACHABLE");
  }
  if (!deleted.ok) throw new IntegrationProviderError(`GOOGLE_TEMP_CALENDAR_DELETE_REJECTED_${deleted.status}`);
  return { calendar: "Temporary Dialoggg verification calendar", capability: "calendar.app.created" };
}

export async function refreshGoogleAccessToken(refreshToken: string, config: Record<string, string>, secrets: Record<string, string>) {
  if (fakeMode()) {
    if (refreshToken.includes("revoked")) throw new IntegrationProviderError("GOOGLE_REFRESH_REJECTED_400");
    if (refreshToken.includes("outage")) throw new IntegrationProviderError("PROVIDER_UNREACHABLE");
    return "fake-access-token";
  }
  const result = await providerJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: secrets.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  }, "GOOGLE_REFRESH_REJECTED");
  if (!result.access_token) throw new IntegrationProviderError("GOOGLE_TOKEN_MISSING");
  return String(result.access_token);
}

export const MICROSOFT_GRAPH_SCOPE = "Files.ReadWrite";

export type MicrosoftTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
  expiresIn: number;
};

export async function exchangeMicrosoftAuthorization(code: string, verifier: string, config: Record<string, string>, secrets: Record<string, string>): Promise<MicrosoftTokenSet> {
  if (fakeMode()) {
    if (code === "fake-deny" || code === "fake-denied") throw new IntegrationProviderError("OAUTH_AUTHORIZATION_REJECTED");
    if (code === "fake-provider-outage") throw new IntegrationProviderError("PROVIDER_UNREACHABLE");
    if (code === "fake-wrong-callback") throw new IntegrationProviderError("MICROSOFT_REDIRECT_URI_MISMATCH");
    return {
      accessToken: "fake-microsoft-access-token",
      refreshToken: "fake-microsoft-refresh-token",
      scope: code === "fake-missing-scope" ? "openid profile User.Read" : "openid profile offline_access User.Read Files.ReadWrite",
      expiresIn: 3600,
    };
  }
  const tenant = config.tenantId || "organizations";
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: callbackUri("microsoft"),
    scope: "openid profile offline_access User.Read Files.ReadWrite",
  });
  if (config.credentialMode === "certificate") {
    const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const thumbprint = config.certificateThumbprint.replaceAll(":", "");
    if (!/^[A-Fa-f0-9]{40}$/.test(thumbprint) || !secrets.certificate) throw new IntegrationProviderError("MICROSOFT_CERTIFICATE_INVALID");
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encoded({ alg: "RS256", typ: "JWT", x5t: Buffer.from(thumbprint, "hex").toString("base64url") })}.${encoded({ aud: tokenUrl, iss: config.clientId, sub: config.clientId, jti: randomBytes(16).toString("hex"), nbf: now - 30, exp: now + 300 })}`;
    let signature: string;
    try { signature = createSign("RSA-SHA256").update(unsigned).end().sign(secrets.certificate).toString("base64url"); }
    catch { throw new IntegrationProviderError("MICROSOFT_CERTIFICATE_INVALID"); }
    body.set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
    body.set("client_assertion", `${unsigned}.${signature}`);
  } else {
    body.set("client_secret", secrets.clientSecret);
  }
  const result = await providerJson(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  }, "MICROSOFT_TOKEN_REJECTED");
  if (!result.access_token) throw new IntegrationProviderError("MICROSOFT_TOKEN_MISSING");
  return {
    accessToken: String(result.access_token),
    refreshToken: result.refresh_token ? String(result.refresh_token) : null,
    scope: String(result.scope || ""),
    expiresIn: Number(result.expires_in || 0),
  };
}

export function requireMicrosoftScope(scope: string) {
  const scopes = new Set(scope.split(/\s+/).filter(Boolean).map(value => value.toLowerCase()));
  if (!scopes.has(MICROSOFT_GRAPH_SCOPE.toLowerCase())) throw new IntegrationProviderError("MICROSOFT_SCOPE_MISSING");
}

export async function refreshMicrosoftAccessToken(refreshToken: string, config: Record<string, string>, secrets: Record<string, string>) {
  if (fakeMode()) {
    if (refreshToken.includes("revoked")) throw new IntegrationProviderError("MICROSOFT_REFRESH_REVOKED");
    if (refreshToken.includes("outage")) throw new IntegrationProviderError("PROVIDER_UNREACHABLE");
    return { accessToken: "fake-microsoft-access-token", expiresIn: 3600, refreshToken: null as string | null };
  }
  const tenant = config.tenantId || "organizations";
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: secrets.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: "openid profile offline_access User.Read Files.ReadWrite",
  });
  const result = await providerJson(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  }, "MICROSOFT_REFRESH_REJECTED");
  if (!result.access_token) throw new IntegrationProviderError("MICROSOFT_TOKEN_MISSING");
  return {
    accessToken: String(result.access_token),
    expiresIn: Number(result.expires_in || 0),
    refreshToken: result.refresh_token ? String(result.refresh_token) : null,
  };
}

async function verifyMicrosoftCapability(accessToken: string, config: Record<string, string>) {
  if (fakeMode()) return { identity: "Fake Microsoft administrator", storageMode: config.storageMode || "onedrive", capability: MICROSOFT_GRAPH_SCOPE };
  const authorization = { authorization: `Bearer ${accessToken}` };
  const identity = await providerJson(
    "https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName",
    { headers: authorization }, "MICROSOFT_IDENTITY_REJECTED",
  );
  if (!identity.id) throw new IntegrationProviderError("MICROSOFT_IDENTITY_MISSING");
  let rootUrl = "https://graph.microsoft.com/v1.0/me/drive/root";
  if (config.storageMode === "sharepoint") {
    if (!config.sharepointHost || !config.sharepointPath) throw new IntegrationProviderError("SHAREPOINT_LOCATION_REQUIRED");
    const site = await providerJson(
      `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(config.sharepointHost)}:/${config.sharepointPath.split("/").map(encodeURIComponent).join("/")}`,
      { headers: authorization }, "MICROSOFT_SITE_DISCOVERY_REJECTED",
    );
    if (!site.id) throw new IntegrationProviderError("MICROSOFT_SITE_MISSING");
    rootUrl = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(site.id)}/drive/root`;
  }
  await providerJson(rootUrl, { headers: authorization }, "MICROSOFT_ROOT_DISCOVERY_REJECTED");
  const filename = `.dialoggg-capability-check-${randomBytes(6).toString("hex")}.txt`;
  const item = await providerJson(`${rootUrl}:/${filename}:/content`, {
    method: "PUT",
    headers: { ...authorization, "content-type": "text/plain" },
    body: "Dialoggg capability check. This temporary file is deleted immediately.",
  }, "MICROSOFT_WRITE_REJECTED");
  if (!item.id || !item.parentReference?.driveId) throw new IntegrationProviderError("MICROSOFT_WRITE_RESULT_MISSING");
  const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(item.parentReference?.driveId)}/items/${encodeURIComponent(item.id)}`, {
    method: "DELETE", headers: authorization, cache: "no-store",
  });
  if (!response.ok) throw new IntegrationProviderError("MICROSOFT_TEMP_DELETE_REJECTED");
  return {
    identity: String(identity.displayName || identity.userPrincipalName || "Microsoft account"),
    storageMode: config.storageMode || "onedrive",
    capability: "Files.ReadWrite",
  };
}

export async function verifyOauthProvider(input: {
  provider: "google" | "microsoft";
  code: string;
  verifier: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
}) {
  if (input.provider === "google") {
    const tokens = await exchangeGoogleAuthorization(input.code, input.verifier, input.config, input.secrets);
    requireGoogleScope(tokens.scope);
    return verifyGoogleCapability(tokens.accessToken);
  }
  const tokens = await exchangeMicrosoftAuthorization(input.code, input.verifier, input.config, input.secrets);
  requireMicrosoftScope(tokens.scope);
  return verifyMicrosoftCapability(tokens.accessToken, input.config);
}

export async function validateResend(input: { config: Record<string, string>; secrets: Record<string, string> }) {
  const fromDomain = input.config.fromAddress?.split("@")[1]?.toLowerCase();
  const configuredDomain = input.config.sendingDomain?.toLowerCase();
  if (!fromDomain || !configuredDomain || fromDomain !== configuredDomain) {
    throw new IntegrationProviderError("RESEND_FROM_DOMAIN_MISMATCH");
  }
  if (fakeMode()) {
    if (!input.secrets.apiKey.startsWith("re_test_")) throw new IntegrationProviderError("RESEND_KEY_REJECTED");
    if (configuredDomain !== "verified.example.test") throw new IntegrationProviderError("RESEND_DOMAIN_NOT_VERIFIED");
    return { domain: configuredDomain, state: "verified" };
  }
  const result = await providerJson("https://api.resend.com/domains", {
    headers: { authorization: `Bearer ${input.secrets.apiKey}` },
  }, "RESEND_KEY_REJECTED");
  const domains = Array.isArray(result.data) ? result.data : [];
  const match = domains.find((domain: any) => String(domain?.name).toLowerCase() === configuredDomain);
  if (!match || String(match.status).toLowerCase() !== "verified") throw new IntegrationProviderError("RESEND_DOMAIN_NOT_VERIFIED");
  return { domain: configuredDomain, state: "verified" };
}

export async function sendResendTest(input: { config: Record<string, string>; secrets: Record<string, string>; recipient: string; idempotencyKey: string }) {
  if (fakeMode()) return { id: "fake-email-id" };
  return providerJson("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.secrets.apiKey}`,
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from: `${input.config.fromName} <${input.config.fromAddress}>`,
      to: [input.recipient],
      reply_to: input.config.replyTo || undefined,
      subject: "Dialoggg email setup test",
      text: "Your Dialoggg Resend configuration passed an explicitly requested test.",
    }),
  }, "RESEND_TEST_EMAIL_REJECTED");
}
