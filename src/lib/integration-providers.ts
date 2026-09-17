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
    url.searchParams.set("code", input.config.clientId?.includes("deny") ? "fake-denied" : "fake-success");
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

async function googleAccessToken(code: string, verifier: string, config: Record<string, string>, secrets: Record<string, string>) {
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
  return String(result.access_token);
}

async function verifyGoogleCapability(accessToken: string) {
  const headers = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
  const listed = await providerJson(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=owner&maxResults=250",
    { headers }, "GOOGLE_CALENDAR_LIST_REJECTED",
  );
  let calendar = Array.isArray(listed.items)
    ? listed.items.find((item: any) => item?.summary === "Dialoggg" && item?.id)
    : null;
  if (!calendar) {
    calendar = await providerJson("https://www.googleapis.com/calendar/v3/calendars", {
      method: "POST",
      headers,
      body: JSON.stringify({ summary: "Dialoggg", description: "Schedule items managed by Dialoggg." }),
    }, "GOOGLE_CALENDAR_CREATE_REJECTED");
  }
  if (!calendar?.id) throw new IntegrationProviderError("GOOGLE_CALENDAR_MISSING");
  await providerJson(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}`, { headers }, "GOOGLE_CAPABILITY_REJECTED");
  return { calendar: "Dialoggg", capability: "calendar.app.created" };
}

async function microsoftAccessToken(code: string, verifier: string, config: Record<string, string>, secrets: Record<string, string>) {
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
  return String(result.access_token);
}

async function verifyMicrosoftCapability(accessToken: string, config: Record<string, string>) {
  const authorization = { authorization: `Bearer ${accessToken}` };
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
  return { storageMode: config.storageMode || "onedrive", capability: "Files.ReadWrite" };
}

export async function verifyOauthProvider(input: {
  provider: "google" | "microsoft";
  code: string;
  verifier: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
}) {
  if (fakeMode()) {
    if (input.code !== "fake-success") throw new IntegrationProviderError("FAKE_OAUTH_REJECTED");
    return input.provider === "google"
      ? { calendar: "Dialoggg", capability: "calendar.app.created" }
      : { storageMode: input.config.storageMode || "onedrive", capability: "Files.ReadWrite" };
  }
  if (input.provider === "google") {
    return verifyGoogleCapability(await googleAccessToken(input.code, input.verifier, input.config, input.secrets));
  }
  return verifyMicrosoftCapability(await microsoftAccessToken(input.code, input.verifier, input.config, input.secrets), input.config);
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
