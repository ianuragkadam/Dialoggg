import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { bootstrapAccount, login, prepareTestDatabase } from "./test-fixtures.mjs";

const results = []; let appServer; let appOutput = ""; let browser;
async function check(name, operation) { try { await operation(); results.push({ name, status: "PASS" }); process.stdout.write(`PASS  ${name}\n`); } catch (error) { const message = error instanceof Error ? error.message : String(error); results.push({ name, status: "FAIL", message }); process.stdout.write(`FAIL  ${name}\n      ${message}\n`); } }
async function freePort() { const listener = createServer(); await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); }); const address = listener.address(); const port = typeof address === "object" && address ? address.port : 0; await new Promise(resolve => listener.close(resolve)); return port; }
async function loadPlaywright() { if (process.env.DIALOGGG_PLAYWRIGHT_PATH) return import(pathToFileURL(path.join(process.env.DIALOGGG_PLAYWRIGHT_PATH, "index.mjs")).href); return import("playwright").catch(() => { throw new Error("Playwright is unavailable. Set DIALOGGG_PLAYWRIGHT_PATH."); }); }
const sha256 = value => createHash("sha256").update(value).digest("hex");

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-integration-setup-ui-"));
const port = await freePort(); const baseUrl = `http://127.0.0.1:${port}`;
const workshopToken = "workshop_secure_token_1234567890_abcdefghijklmnop";
const reviewToken = "review_secure_token_1234567890_abcdefghijklmnopqr";
const expiredToken = "expired_secure_token_1234567890_abcdefghijklmnop";
const revokedToken = "revoked_secure_token_1234567890_abcdefghijklmnop";
const companyOnlyToken = "company_secure_token_1234567890_abcdefghijklmnop";
const encryptionKey = Buffer.alloc(32, 19).toString("base64");
const platformEmail = "integration-platform@example.test"; const platformPassword = "Integration-Platform-Test-1!";

try {
  const playwright = await loadPlaywright(); prepareTestDatabase(dataDirectory);
  bootstrapAccount(dataDirectory, { fullName: "Integration Platform", email: platformEmail, password: platformPassword, platform: true });
  const database = new Database(path.join(dataDirectory, "dialoggg.db"));
  let companyId;
  try {
    companyId = Number(database.prepare("INSERT INTO company (name, status) VALUES ('Sport Court QA', 'active')").run().lastInsertRowid);
    const insert = database.prepare(`INSERT INTO integration_setup_invitation (token_hash, access_kind, scope_kind, company_id, label, expires_at, revoked_at) VALUES (?, ?, 'platform_and_company', ?, 'Scott integration setup', ?, ?)`);
    insert.run(sha256(workshopToken), "workshop", companyId, new Date(Date.now() + 86_400_000).toISOString(), null);
    insert.run(sha256(reviewToken), "review", companyId, new Date(Date.now() + 86_400_000).toISOString(), null);
    insert.run(sha256(expiredToken), "workshop", companyId, new Date(Date.now() - 60_000).toISOString(), null);
    insert.run(sha256(revokedToken), "workshop", companyId, new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());
    database.prepare(`INSERT INTO integration_setup_invitation (token_hash, access_kind, scope_kind, company_id, label, expires_at) VALUES (?, 'workshop', 'company', ?, 'Company-only setup', ?)`)
      .run(sha256(companyOnlyToken), companyId, new Date(Date.now() + 86_400_000).toISOString());
  } finally { database.close(); }

  appServer = spawn(process.execPath, ["scripts/start-production.mjs"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", PORT: String(port), RAILWAY_VOLUME_MOUNT_PATH: dataDirectory, APP_ENCRYPTION_KEY: encryptionKey, APP_BASE_URL: baseUrl, INTEGRATION_PROVIDER_MODE: "fake" }, stdio: ["ignore", "pipe", "pipe"] });
  appServer.stdout.on("data", chunk => { appOutput += chunk.toString(); }); appServer.stderr.on("data", chunk => { appOutput += chunk.toString(); });
  const startedAt = Date.now(); while (true) { if (appServer.exitCode !== null) throw new Error(`Server exited early.\n${appOutput}`); try { if ((await fetch(`${baseUrl}/integration-setup`)).status === 200) break; } catch {} if (Date.now() - startedAt > 30_000) throw new Error(`Server did not start.\n${appOutput}`); await new Promise(resolve => setTimeout(resolve, 200)); }

  browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await context.newPage();
  const clientErrors = []; page.on("pageerror", error => clientErrors.push(error.message)); page.on("console", message => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) clientErrors.push(message.text()); });

  await check("private fragment is exchanged without reaching the request URL or rendered page", async () => {
    await page.goto(`${baseUrl}/integration-setup#token=${workshopToken}`);
    await page.waitForTimeout(1500);
    const initialBody = await page.locator("body").innerText();
    assert.match(initialBody, /Connect Dialoggg securely/, `${initialBody}\nSERVER:\n${appOutput}`);
    assert.equal(page.url(), `${baseUrl}/integration-setup`);
    const html = await page.content();
    assert.doesNotMatch(html, new RegExp(workshopToken));
    assert.match(await page.locator("body").innerText(), /Never enter a personal Google or Microsoft password/);
    assert.equal(clientErrors.length, 0, clientErrors.join(" | "));
  });

  await check("completion is gated before providers are verified", async () => {
    assert.equal(await page.getByRole("button", { name: "Mark setup complete" }).isDisabled(), true);
  });

  await check("workshop API is no-store and rejects missing CSRF", async () => {
    const result = await page.evaluate(async () => {
      const read = await fetch("/api/integration-setup", { cache: "no-store" });
      const write = await fetch("/api/integration-setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete" }) });
      return { cache: read.headers.get("cache-control"), writeStatus: write.status, writeBody: await write.text() };
    });
    assert.match(result.cache || "", /no-store/); assert.equal(result.writeStatus, 403); assert.match(result.writeBody, /CSRF_REJECTED/);
  });

  await check("Google credential saves encrypted, survives refresh, and reports a fake OAuth failure safely", async () => {
    await page.getByLabel("Cloud project name *").fill("Dialoggg Platform");
    await page.getByLabel("Cloud project ID *").fill("dialoggg-platform-prod");
    await page.getByLabel("OAuth client ID *").fill("google-client-deny");
    await page.getByLabel("Support email *").fill("support@verified.example.test");
    await page.getByLabel("Privacy policy URL *").fill("https://verified.example.test/privacy");
    await page.getByLabel("OAuth client secret *").fill("google-secret-value-9876");
    const save = page.getByRole("button", { name: "Save credential" }).first(); await save.waitFor({ state: "visible" }); await save.click();
    await page.waitForTimeout(1200);
    const googleText = await page.locator("details").filter({ hasText: "Google Calendar" }).innerText();
    assert.match(googleText, /fingerprint [a-f0-9]{12}/, `${googleText}\nSERVER:\n${appOutput}`);
    await page.reload(); await page.getByRole("heading", { name: "Connect Dialoggg securely" }).waitFor();
    assert.equal(await page.getByLabel("Replacement client secret (optional)").first().inputValue(), "");
    await page.getByRole("button", { name: "Connect and verify Google" }).click();
    await page.getByText("Action required", { exact: true }).first().waitFor();
    assert.doesNotMatch(await page.locator("body").innerText(), /google-secret-value-9876/);
  });

  await check("Google reconnect uses PKCE state and verifies the dedicated Dialoggg calendar", async () => {
    await page.getByLabel("OAuth client ID *").fill("google-client-success"); await page.getByLabel("OAuth client ID *").blur();
    await page.getByText("Non-secret details autosaved.").waitFor();
    await page.getByRole("button", { name: "Connect and verify Google" }).click();
    await page.getByText("Verified", { exact: true }).first().waitFor();
  });

  await check("Google secret replacement retires v1, creates v2, and requires re-verification", async () => {
    const google = page.locator("details").filter({ hasText: "Google Calendar" });
    await google.getByLabel("Replacement client secret (optional)").fill("google-secret-rotated-1357");
    page.once("dialog", dialog => dialog.accept());
    await google.getByRole("button", { name: "Save details / replace secret" }).click();
    await google.getByText(/version 2/).waitFor();
    await google.getByRole("button", { name: "Connect and verify Google" }).click();
    await google.getByText("Verified", { exact: true }).first().waitFor();
  });

  await check("Microsoft platform setup verifies through a fake OAuth and Graph capability check", async () => {
    const microsoft = page.locator("details").filter({ hasText: "Microsoft OAuth / Graph application" });
    await microsoft.getByLabel("Application name *").fill("Dialoggg Microsoft");
    await microsoft.getByLabel("Tenant / directory ID *").fill("11111111-1111-4111-8111-111111111111");
    await microsoft.getByLabel("Application / client ID *").fill("22222222-2222-4222-8222-222222222222");
    await microsoft.getByLabel("Verified publisher domain *").fill("verified.example.test");
    await microsoft.getByLabel("Client secret value *").fill("microsoft-secret-value-4321");
    await microsoft.getByRole("button", { name: "Save credential" }).click();
    await page.getByRole("button", { name: "Connect and verify Microsoft" }).click();
    await microsoft.getByText("Verified", { exact: true }).waitFor();
  });

  await check("Resend exact-domain validation and confirmed test email complete safely", async () => {
    await page.getByLabel("Verified sending domain *").fill("verified.example.test");
    await page.getByLabel("From name *").fill("Dialoggg");
    await page.getByLabel("From address *").fill("updates@verified.example.test");
    await page.getByLabel("Reply-To / support address *").fill("support@verified.example.test");
    await page.getByLabel("Resend API key *").fill("re_test_secret_value_2468");
    await page.locator("details").filter({ hasText: "Resend email" }).getByRole("button", { name: "Save credential" }).click();
    await page.getByRole("button", { name: "Validate Resend" }).click();
    await page.locator("details").filter({ hasText: "Resend email" }).getByText("Verified", { exact: true }).waitFor();
    await page.getByLabel("Confirmed test recipient *").fill("qa-recipient@example.test");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Confirm and send one test" }).click();
    await page.getByText("Saved securely.").waitFor();
  });

  await check("all Verified providers unlock completion and persist without plaintext", async () => {
    const complete = page.getByRole("button", { name: "Mark setup complete" }); assert.equal(await complete.isEnabled(), true); await complete.click(); await page.getByRole("button", { name: "Completed" }).waitFor();
    const db = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      const credentials = db.prepare("SELECT encrypted_envelope FROM integration_credential_version").all(); assert.equal(credentials.length, 4);
      const serialized = JSON.stringify(credentials); for (const secret of ["google-secret-value-9876", "google-secret-rotated-1357", "microsoft-secret-value-4321", "re_test_secret_value_2468"]) assert.doesNotMatch(serialized, new RegExp(secret));
      assert.deepEqual(db.prepare("SELECT is_active, COUNT(*) AS count FROM integration_credential_version GROUP BY is_active ORDER BY is_active").all(), [{ is_active: 0, count: 1 }, { is_active: 1, count: 3 }]);
      const audits = JSON.stringify(db.prepare("SELECT metadata_json FROM audit_event WHERE action LIKE 'integration_%'").all()); for (const secret of ["google-secret-value-9876", "microsoft-secret-value-4321", "re_test_secret_value_2468"]) assert.doesNotMatch(audits, new RegExp(secret));
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM integration_validation_attempt WHERE status = 'passed'").get().count >= 4, true);
      const invitationRows = JSON.stringify(db.prepare("SELECT token_hash FROM integration_setup_invitation").all()); for (const token of [workshopToken, reviewToken, expiredToken, revokedToken, companyOnlyToken]) assert.doesNotMatch(invitationRows, new RegExp(token));
    } finally { db.close(); }
  });

  await check("read-only review link shows status metadata and no credential values", async () => {
    const reviewContext = await browser.newContext({ viewport: { width: 1200, height: 900 } }); const review = await reviewContext.newPage(); await review.goto(`${baseUrl}/integration-setup-review#token=${reviewToken}`); await review.getByRole("heading", { name: "Integration setup status" }).waitFor(); const body = await review.locator("body").innerText(); assert.match(body, /Internal read-only view/i); assert.doesNotMatch(body, /Completed: Not yet/); assert.equal((body.match(/Verified/g) || []).length, 6); for (const secret of ["google-secret-value-9876", "microsoft-secret-value-4321", "re_test_secret_value_2468"]) assert.doesNotMatch(body, new RegExp(secret)); assert.equal(review.url(), `${baseUrl}/integration-setup-review`); await reviewContext.close();
  });

  await check("expired and revoked invitations fail closed", async () => {
    for (const token of [expiredToken, revokedToken]) { const deniedContext = await browser.newContext(); const denied = await deniedContext.newPage(); await denied.goto(`${baseUrl}/integration-setup#token=${token}`); await denied.getByRole("heading", { name: "Private link required" }).waitFor(); assert.equal(denied.url(), `${baseUrl}/integration-setup`); await deniedContext.close(); }
  });

  await check("company-only invitation exposes no platform credentials and directs storage setup to authenticated settings", async () => {
    const scopedContext = await browser.newContext(); const scoped = await scopedContext.newPage(); await scoped.goto(`${baseUrl}/integration-setup#token=${companyOnlyToken}`); await scoped.getByRole("heading", { name: "Connect Dialoggg securely" }).waitFor(); const body = await scoped.locator("body").innerText(); assert.match(body, /0 of 0 verified/); assert.match(body, /Settings → Microsoft Storage/); assert.doesNotMatch(body, /Google Calendar/); assert.doesNotMatch(body, /Resend email/); assert.doesNotMatch(body, /Microsoft OAuth \/ Graph application/); await scopedContext.close();
  });

  await check("ciphertext tampering fails closed with a structured redacted error", async () => {
    const db = new Database(path.join(dataDirectory, "dialoggg.db"));
    try { db.prepare(`UPDATE integration_credential_version SET encrypted_envelope = json_set(encrypted_envelope, '$.tag', 'AAAAAAAAAAAAAAAAAAAAAA==') WHERE config_id = (SELECT id FROM integration_config WHERE provider = 'resend_platform') AND is_active = 1`).run(); } finally { db.close(); }
    const result = await page.evaluate(async () => {
      const csrf = document.cookie.split("; ").find(item => item.startsWith("dialoggg_integration_csrf="))?.split("=").slice(1).join("=") || "";
      const response = await fetch("/api/integration-setup", { method: "POST", headers: { "content-type": "application/json", "x-workshop-csrf": csrf }, body: JSON.stringify({ action: "validate", provider: "resend_platform" }) });
      return { status: response.status, text: await response.text() };
    });
    assert.equal(result.status, 400); assert.match(result.text, /INTEGRATION_SETUP_FAILED/); for (const secret of ["re_test_secret_value_2468", "ciphertext", "encrypted_envelope"]) assert.doesNotMatch(result.text, new RegExp(secret, "i"));
  });

  await check("credential revocation requires confirmation and retires the active version", async () => {
    const resend = page.locator("details").filter({ hasText: "Resend email" }); page.once("dialog", dialog => dialog.accept()); await resend.getByRole("button", { name: "Revoke credential" }).click(); await resend.getByText("Not started", { exact: true }).first().waitFor();
  });

  await check("phone and keyboard layouts remain usable", async () => {
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } }); const mobile = await mobileContext.newPage(); await mobile.goto(`${baseUrl}/integration-setup#token=${workshopToken}`); await mobile.getByRole("heading", { name: "Connect Dialoggg securely" }).waitFor(); const size = await mobile.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })); assert.ok(size.scrollWidth <= size.width + 1, JSON.stringify(size)); await mobile.keyboard.press("Tab"); assert.notEqual(await mobile.evaluate(() => document.activeElement?.tagName), "BODY"); await mobileContext.close();
  });

  await check("Platform Administrator explicitly authorizes and rotates platform-only workshop/review links", async () => {
    const loginResponse = await login(baseUrl, platformEmail, platformPassword);
    const combined = loginResponse.headers.get("set-cookie") || "";
    const session = combined.match(/dialoggg_session=([^;]+)/)?.[1]; const csrf = combined.match(/dialoggg_csrf=([^;]+)/)?.[1]; assert.ok(session && csrf);
    const adminContext = await browser.newContext(); await adminContext.addCookies([
      { name: "dialoggg_session", value: session, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
      { name: "dialoggg_csrf", value: csrf, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Strict" },
    ]);
    const admin = await adminContext.newPage(); await admin.goto(`${baseUrl}/platform/integration-setup`); await admin.getByRole("heading", { name: "Secure integration setup access" }).waitFor(); const body = await admin.locator("body").innerText(); assert.match(body, /Platform providers only/); assert.match(body, /Settings → Microsoft Storage/); assert.equal(await admin.getByLabel("Access scope").count(), 0); const issue = admin.getByRole("button", { name: "Issue and rotate links" }); assert.equal(await issue.isDisabled(), true); await admin.getByLabel(/I explicitly authorize access to platform credentials/).check(); await issue.click(); await admin.getByRole("heading", { name: "Copy these links now" }).waitFor(); const workshopUrl = await admin.getByLabel("Scott workshop link").inputValue(); const reviewUrl = await admin.getByLabel("Internal review link").inputValue(); assert.match(workshopUrl, new RegExp(`^${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/integration-setup#token=`)); assert.match(reviewUrl, /\/integration-setup-review#token=/); assert.notEqual(workshopUrl, reviewUrl);
    const db = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true }); try { const stored = JSON.stringify(db.prepare("SELECT token_hash FROM integration_setup_invitation").all()); assert.doesNotMatch(stored, new RegExp(workshopUrl.split("#token=")[1])); assert.doesNotMatch(stored, new RegExp(reviewUrl.split("#token=")[1])); } finally { db.close(); }
    await adminContext.close();
  });

  await check("Platform Administrator manages permanent Resend settings with write-only secrets and explicit test-send confirmation", async () => {
    const loginResponse = await login(baseUrl, platformEmail, platformPassword);
    const combined = loginResponse.headers.get("set-cookie") || "";
    const session = combined.match(/dialoggg_session=([^;]+)/)?.[1]; const csrf = combined.match(/dialoggg_csrf=([^;]+)/)?.[1]; assert.ok(session && csrf);
    const adminContext = await browser.newContext(); await adminContext.addCookies([
      { name: "dialoggg_session", value: session, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
      { name: "dialoggg_csrf", value: csrf, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Strict" },
    ]);
    const admin = await adminContext.newPage(); await admin.goto(`${baseUrl}/platform/integration-setup`);
    const resend = admin.getByRole("region", { name: "Resend transactional email settings" }); await resend.getByRole("heading", { name: "Resend transactional email settings" }).waitFor();
    await resend.getByLabel("Verified sending domain").fill("verified.example.test");
    await resend.getByLabel("From name").fill("Dialoggg");
    await resend.getByLabel("From address").fill("notifications@verified.example.test");
    await resend.getByLabel("Reply-To / support address").fill("support@verified.example.test");
    await resend.getByLabel("Resend API key").fill("re_test_permanent_resend_secret");
    await resend.getByLabel("Replacement webhook signing secret (optional)").fill("whsec_permanent_secret");
    await resend.getByLabel("Current Platform Administrator password").fill(platformPassword);
    const saveResponsePromise = admin.waitForResponse(response => response.url().endsWith("/api/v1/platform/integration-settings/resend") && response.request().method() === "POST");
    await resend.getByRole("button", { name: "Save encrypted credential" }).click();
    const saveResponse = await saveResponsePromise; const saveBody = await saveResponse.text(); assert.equal(saveResponse.status(), 200, saveBody);
    const afterSave = await resend.innerText();
    assert.match(afterSave, /Saved—verification required/, afterSave);
    assert.doesNotMatch(afterSave, /re_test_permanent_resend_secret|whsec_permanent_secret/);
    await resend.getByRole("button", { name: "Validate domain and sender" }).click();
    await resend.getByText("Valid", { exact: true }).waitFor();
    assert.match(await resend.innerText(), /DNS ready; SPF verified; DKIM verified/);
    await resend.getByLabel("Confirmed test recipient").fill("resend-ui@example.test");
    admin.once("dialog", dialog => dialog.accept());
    await resend.getByRole("button", { name: "Confirm and send one test" }).click();
    await resend.getByText("One confirmed test email was accepted by Resend.").waitFor();
    const db = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      const stored = JSON.stringify(db.prepare("SELECT encrypted_envelope FROM integration_credential_version WHERE config_id = (SELECT id FROM integration_config WHERE provider = 'resend_platform')").all());
      assert.doesNotMatch(stored, /re_test_permanent_resend_secret|whsec_permanent_secret/);
      const audit = JSON.stringify(db.prepare("SELECT metadata_json FROM audit_event WHERE action LIKE 'integration_resend.%'").all());
      assert.doesNotMatch(audit, /re_test_permanent_resend_secret|whsec_permanent_secret|resend-ui@example\.test/);
    } finally { db.close(); }
    await adminContext.close();
  });

  await context.close();
} finally { if (browser) await browser.close(); if (appServer && appServer.exitCode === null) { appServer.kill(); await new Promise(resolve => setTimeout(resolve, 600)); } await rm(dataDirectory, { recursive: true, force: true }); }
const passed = results.filter(item => item.status === "PASS").length; const failed = results.length - passed; process.stdout.write(`\nRESULT  ${passed} passed, ${failed} failed, ${results.length} total\n`); if (failed) process.exitCode = 1;
