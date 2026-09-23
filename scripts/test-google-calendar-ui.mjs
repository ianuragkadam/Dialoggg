import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { bootstrapAccount, login, prepareTestDatabase } from "./test-fixtures.mjs";

const results = [];
let appServer;
let appOutput = "";
let browser;

async function check(name, operation) {
  try {
    await operation();
    results.push({ name, status: "PASS" });
    process.stdout.write(`PASS  ${name}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", message });
    process.stdout.write(`FAIL  ${name}\n      ${message}\n`);
  }
}

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function loadPlaywright() {
  const supplied = process.env.DIALOGGG_PLAYWRIGHT_PATH;
  if (supplied) return import(pathToFileURL(path.join(supplied, "index.mjs")).href);
  try { return await import("playwright"); }
  catch { throw new Error("Playwright unavailable; set DIALOGGG_PLAYWRIGHT_PATH."); }
}

function authCookies(response) {
  const combined = response.headers.get("set-cookie") || "";
  const session = combined.match(/dialoggg_session=([^;]+)/)?.[1];
  const csrf = combined.match(/dialoggg_csrf=([^;]+)/)?.[1];
  assert.ok(session && csrf, "login must return session and CSRF cookies");
  return { session, csrf };
}

async function addAuth(context, cookies) {
  await context.addCookies([
    { name: "dialoggg_session", value: cookies.session, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
    { name: "dialoggg_csrf", value: cookies.csrf, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
  ]);
}

async function waitForServer(baseUrl) {
  const started = Date.now();
  while (true) {
    if (appServer.exitCode !== null) throw new Error(`Server exited.\n${appOutput}`);
    try { if ((await fetch(`${baseUrl}/login`)).status === 200) return; } catch {}
    if (Date.now() - started > 30_000) throw new Error(`Server timeout.\n${appOutput}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-google-ui-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = Date.now().toString(36);
const password = "Google-UI-Test-1!";
const platformPassword = "Google-Platform-Test-1!";
const encryptionKey = Buffer.alloc(32, 29).toString("base64");
const clientSecret = "google-focused-client-secret-9876";
const rotatedSecret = "google-focused-rotated-secret-2468";

try {
  const playwright = await loadPlaywright();
  const adminEmail = `google-admin-${suffix}@example.test`;
  const employeeEmail = `google-employee-${suffix}@example.test`;
  const platformEmail = `google-platform-${suffix}@example.test`;
  prepareTestDatabase(dataDirectory);
  const admin = bootstrapAccount(dataDirectory, { companyName: "Google QA", fullName: "Google Admin", email: adminEmail, password, role: "admin" });
  bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Google Employee", email: employeeEmail, password, role: "employee" });
  bootstrapAccount(dataDirectory, { fullName: "Google Platform", email: platformEmail, password: platformPassword, platform: true });

  const database = new Database(path.join(dataDirectory, "dialoggg.db"));
  database.pragma("foreign_keys = ON");
  try {
    const categoryId = database.prepare("SELECT id FROM resource_category WHERE company_id = ? AND name = 'Employee'").get(admin.companyId).id;
    const resourceId = Number(database.prepare(`
      INSERT INTO resource (company_id, category_id, name, normalized_name, email, linked_membership_id, status)
      VALUES (?, ?, 'Google QA Crew', 'google qa crew', ?, ?, 'active')
    `).run(admin.companyId, categoryId, adminEmail, admin.membershipId).lastInsertRowid);
    const projectId = Number(database.prepare(`
      INSERT INTO project (company_id, project_type_id, name, start_date, created_by)
      VALUES (?, ?, 'Google Delivery Court', '2026-09-20', ?)
    `).run(admin.companyId, admin.defaultProjectTypeId, admin.legacyUserId).lastInsertRowid);
    const taskId = Number(database.prepare(`
      INSERT INTO task (project_id, name, start_date, duration, external_visible)
      VALUES (?, 'Prepare playing surface', '2026-09-22', 2, 1)
    `).run(projectId).lastInsertRowid);
    database.prepare("INSERT INTO task_resource (task_id, resource_id) VALUES (?, ?)").run(taskId, resourceId);
    const eventId = Number(database.prepare(`
      INSERT INTO event_series (
        company_id, project_id, title, timing_mode, start_date, end_date,
        time_zone, push_to_project, external_visible, created_by_membership_id, updated_by_membership_id
      ) VALUES (?, ?, 'Google QA walkthrough', 'all_day', '2026-09-23', '2026-09-23',
        'America/New_York', 1, 1, ?, ?)
    `).run(admin.companyId, projectId, admin.membershipId, admin.membershipId).lastInsertRowid);
    database.prepare("INSERT INTO event_resource (series_id, resource_id) VALUES (?, ?)").run(eventId, resourceId);
  } finally { database.close(); }

  appServer = spawn(process.execPath, ["scripts/start-production.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      RAILWAY_VOLUME_MOUNT_PATH: dataDirectory,
      APP_ENCRYPTION_KEY: encryptionKey,
      APP_BASE_URL: baseUrl,
      INTEGRATION_PROVIDER_MODE: "fake",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  appServer.stdout.on("data", chunk => { appOutput += chunk.toString(); });
  appServer.stderr.on("data", chunk => { appOutput += chunk.toString(); });
  await waitForServer(baseUrl);

  const platformCookies = authCookies(await login(baseUrl, platformEmail, platformPassword));
  const adminCookies = authCookies(await login(baseUrl, adminEmail, password));
  const employeeCookies = authCookies(await login(baseUrl, employeeEmail, password));

  browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const platformContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await addAuth(platformContext, platformCookies);
  const platformPage = await platformContext.newPage();
  const googleSettings = platformPage.getByRole("region", { name: "Google OAuth application settings" });
  const clientErrors = [];
  platformPage.on("pageerror", error => clientErrors.push(error.message));
  platformPage.on("console", message => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) clientErrors.push(message.text()); });

  await check("permanent Platform Google settings expose safe defaults and callback", async () => {
    await platformPage.goto(`${baseUrl}/platform/integration-setup`);
    await platformPage.getByRole("heading", { name: "Google OAuth application settings" }).waitFor();
    const diagnostic = await platformPage.evaluate(async () => {
      const response = await fetch("/api/v1/platform/integration-settings/google", { cache: "no-store" });
      return { status: response.status, body: await response.text(), cookie: document.cookie };
    });
    assert.equal(diagnostic.status, 200, `${JSON.stringify(diagnostic)}\nSERVER:\n${appOutput}`);
    await platformPage.waitForFunction(() => Array.from(document.querySelectorAll("input[readonly]")).some(input => input.value.length > 0));
    await googleSettings.getByText("Not configured", { exact: true }).waitFor();
    assert.equal(await googleSettings.getByLabel("Authorized callback URL").inputValue(), `${baseUrl}/api/integrations/oauth/google/callback`);
    const body = await platformPage.locator("body").innerText();
    assert.match(body, /write-only and encrypted/);
    assert.match(body, /calendar\.app\.created/);
    assert.match(body, /temporary Calendar create\/read\/delete capability check/);
  });

  await check("Platform save requires password reauthentication", async () => {
    await googleSettings.getByLabel("Cloud project name").fill("Dialoggg Platform");
    await googleSettings.getByLabel("Cloud project ID").fill("dialoggg-platform-test");
    await googleSettings.getByLabel("Web OAuth client ID").fill("123456789-dialoggg.apps.googleusercontent.com");
    await googleSettings.getByLabel("Support email").fill("support@example.test");
    await googleSettings.getByLabel("HTTPS privacy policy URL").fill("https://example.test/privacy");
    await googleSettings.getByLabel("Consent-screen status").selectOption("verified");
    await googleSettings.getByLabel("Environment").selectOption("test");
    await googleSettings.getByLabel("OAuth client secret").fill(clientSecret);
    await googleSettings.getByLabel("Current Platform Administrator password").fill("wrong-password");
    await googleSettings.getByRole("button", { name: "Save encrypted credential" }).click();
    await googleSettings.getByRole("alert").filter({ hasText: "Confirm your current Platform Administrator password" }).waitFor();
    await googleSettings.getByText("Not configured", { exact: true }).waitFor();
  });

  await check("Platform Google credential saves encrypted and verifies through OAuth capability check", async () => {
    await googleSettings.getByLabel("Current Platform Administrator password").fill(platformPassword);
    await googleSettings.getByRole("button", { name: "Save encrypted credential" }).click();
    await googleSettings.getByText("Saved—verification required", { exact: true }).waitFor();
    assert.equal(await googleSettings.getByLabel("Replacement client secret (optional)").inputValue(), "");
    await googleSettings.getByRole("button", { name: "Verify with Google" }).click();
    await platformPage.waitForURL(/\/platform\/integration-setup\?oauth=google&status=verified/);
    await googleSettings.getByText("Valid", { exact: true }).waitFor();
  });

  await check("Platform secret rotation, disable, enable, and retry remain safe", async () => {
    await googleSettings.getByLabel("Replacement client secret (optional)").fill(rotatedSecret);
    await googleSettings.getByLabel("Current Platform Administrator password").fill(platformPassword);
    await googleSettings.getByRole("button", { name: "Save details / rotate secret" }).click();
    await googleSettings.getByText("Saved—verification required", { exact: true }).waitFor();
    await googleSettings.getByRole("button", { name: "Verify with Google" }).click();
    await platformPage.waitForURL(/status=verified/);
    await googleSettings.getByText("Valid", { exact: true }).waitFor();
    await googleSettings.getByLabel("Current Platform Administrator password").fill(platformPassword);
    await googleSettings.getByRole("button", { name: "Disable" }).click();
    await googleSettings.getByText("Disabled", { exact: true }).waitFor();
    await googleSettings.getByLabel("Current Platform Administrator password").fill(platformPassword);
    await googleSettings.getByRole("button", { name: "Enable" }).click();
    await googleSettings.getByText("Saved—verification required", { exact: true }).waitFor();
    await googleSettings.getByRole("button", { name: "Retry verification" }).click();
    await platformPage.waitForURL(/status=verified/);
    await googleSettings.getByText("Valid", { exact: true }).waitFor();
  });

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await addAuth(adminContext, adminCookies);
  const page = await adminContext.newPage();
  page.on("pageerror", error => clientErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) clientErrors.push(message.text()); });

  await check("Account Settings opens the real one-way Google Calendar manager", async () => {
    await page.goto(`${baseUrl}/account`);
    const link = page.getByRole("link", { name: "Manage Google Calendar" });
    assert.equal(await link.getAttribute("href"), "/account/google-calendar");
    await link.click();
    await page.locator('[data-google-calendar-ready="true"]').waitFor();
    const body = await page.locator("body").innerText();
    for (const expected of [
      "Personal one-way schedule delivery",
      "dedicated calendar named Dialoggg",
      "Dialoggg stays the source of truth",
      "Synchronization is one-way: Dialoggg → Google",
      "nothing is written to your primary Google calendar",
      "Google default reminders",
    ]) assert.match(body, new RegExp(expected, "i"));
  });

  await check("Google mutations reject missing CSRF", async () => {
    const rejected = await page.evaluate(async () => {
      const response = await fetch("/api/google-calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "oauth_start" }) });
      return { status: response.status, body: await response.text() };
    });
    assert.equal(rejected.status, 403);
    assert.match(rejected.body, /ACTION_FORBIDDEN/);
  });

  await check("personal OAuth is explicitly consented and delivers eligible Task and Event", async () => {
    await page.getByRole("button", { name: "Connect Google Calendar" }).click();
    const dialog = page.getByRole("dialog", { name: "Connect Google Calendar" });
    const action = dialog.getByRole("button", { name: "Continue to Google" });
    assert.equal(await action.isDisabled(), true);
    assert.match(await dialog.innerText(), /your own Google account/);
    assert.match(await dialog.innerText(), /calendar\.app\.created/);
    await dialog.getByLabel(/personal connection/).check();
    await action.click();
    await page.waitForURL(/\/account\/google-calendar\?oauth=google&status=verified/);
    await page.getByText("Connected · healthy", { exact: true }).waitFor();
    const managed = await page.evaluate(async () => {
      const response = await fetch("/api/google-calendar", { cache: "no-store" });
      const result = await response.json();
      return Number(result.data?.health?.managedItems);
    });
    assert.ok(managed >= 2, `expected Task and Event mappings, got ${managed}`);
  });

  await check("safe Google item preview excludes sensitive details", async () => {
    await page.getByTestId("google-item-preview").click();
    const dialog = page.getByRole("dialog", { name: "Safe Google item preview" });
    const text = await dialog.innerText();
    assert.match(text, /Managed by Dialoggg/);
    assert.match(text, /Google edits will not be saved/);
    assert.match(text, /Google default reminders/);
    for (const hidden of ["client email", "phone", "site address", "internal notes", "dependency lag", "private Resource details", "Microsoft links"]) assert.match(text, new RegExp(hidden, "i"));
    await dialog.getByRole("button", { name: "Close preview" }).click();
  });

  await check("manual reconciliation is idempotent and exposes health", async () => {
    const db = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    let before;
    try { before = db.prepare("SELECT COUNT(*) count FROM google_item_mapping").get().count; }
    finally { db.close(); }
    await page.getByRole("button", { name: "Sync now" }).click();
    await page.getByRole("status").filter({ hasText: "Reconciliation completed" }).waitFor();
    const verify = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      assert.equal(verify.prepare("SELECT COUNT(*) count FROM google_item_mapping").get().count, before);
      assert.equal(verify.prepare("SELECT google_event_id FROM google_item_mapping GROUP BY connection_id, google_event_id HAVING COUNT(*) > 1").get(), undefined);
      assert.ok(verify.prepare("SELECT COUNT(*) count FROM google_sync_run WHERE status = 'completed'").get().count >= 2);
    } finally { verify.close(); }
  });

  await check("disconnect requires a remove-or-retain choice and acknowledgement", async () => {
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Disconnect Google Calendar?" });
    const action = dialog.getByRole("button", { name: "Disconnect Google Calendar", exact: true });
    assert.equal(await action.isDisabled(), true);
    assert.match(await dialog.innerText(), /Remove managed items/);
    assert.match(await dialog.innerText(), /stale copies/);
    await dialog.getByLabel(/Retain existing items/).check();
    await dialog.getByLabel(/I understand synchronization stops/).check();
    await action.click();
    await page.getByText("Not connected", { exact: true }).waitFor();
    await page.getByRole("status").filter({ hasText: "retained as stale copies" }).waitFor();
    const verify = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try { assert.ok(verify.prepare("SELECT COUNT(*) count FROM google_item_mapping WHERE sync_state = 'retained'").get().count >= 2); }
    finally { verify.close(); }
  });

  await check("Employee sees only their own personal connection", async () => {
    const context = await browser.newContext();
    await addAuth(context, employeeCookies);
    const employee = await context.newPage();
    await employee.goto(`${baseUrl}/account/google-calendar`);
    await employee.locator('[data-google-calendar-ready="true"]').waitFor();
    assert.match(await employee.locator("body").innerText(), new RegExp(employeeEmail));
    assert.match(await employee.locator("body").innerText(), /Current Role: Employee \(Internal\)/);
    assert.equal(await employee.getByText("Not connected", { exact: true }).count(), 1);
    assert.equal(await employee.getByRole("link", { name: "Users" }).count(), 0);
    await context.close();
  });

  await check("phone layout has no page-level horizontal overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/account/google-calendar`);
    await page.locator('[data-google-calendar-ready="true"]').waitFor();
    const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(size.scrollWidth <= size.width, JSON.stringify(size));
  });

  await check("Platform revoke removes the active credential without exposing secrets", async () => {
    await platformPage.goto(`${baseUrl}/platform/integration-setup`);
    await googleSettings.getByText("Valid", { exact: true }).waitFor();
    await googleSettings.getByLabel("Current Platform Administrator password").fill(platformPassword);
    platformPage.once("dialog", dialog => dialog.accept());
    await googleSettings.getByRole("button", { name: "Revoke" }).click();
    await googleSettings.getByText("Not configured", { exact: true }).waitFor();
    const verify = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      const credentials = JSON.stringify(verify.prepare("SELECT encrypted_envelope FROM integration_credential_version").all());
      const audits = JSON.stringify(verify.prepare("SELECT metadata_json FROM audit_event WHERE action LIKE 'integration_google.%'").all());
      for (const secret of [clientSecret, rotatedSecret]) {
        assert.doesNotMatch(credentials, new RegExp(secret));
        assert.doesNotMatch(audits, new RegExp(secret));
      }
      assert.equal(verify.prepare("SELECT COUNT(*) count FROM integration_credential_version WHERE is_active = 1").get().count, 0);
    } finally { verify.close(); }
  });

  await check("Platform Account explains company context and blocks the personal Google manager", async () => {
    await platformPage.goto(`${baseUrl}/account`);
    await platformPage.getByText("Google Calendar requires a company context", { exact: true }).waitFor();
    assert.equal(await platformPage.getByRole("link", { name: "Manage Google Calendar" }).count(), 0);
    await platformPage.goto(`${baseUrl}/account/google-calendar`);
    assert.equal(new URL(platformPage.url()).pathname, "/account");
  });

  await check("signed-out Google Calendar route returns to Login", async () => {
    const context = await browser.newContext();
    const anonymous = await context.newPage();
    await anonymous.goto(`${baseUrl}/account/google-calendar`);
    assert.equal(new URL(anonymous.url()).pathname, "/login");
    await context.close();
  });

  assert.equal(clientErrors.length, 0, clientErrors.join(" | "));
  await adminContext.close();
  await platformContext.close();
} finally {
  if (browser) await browser.close();
  if (appServer && appServer.exitCode === null) {
    appServer.kill();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  await rm(dataDirectory, { recursive: true, force: true });
}

const passed = results.filter(item => item.status === "PASS").length;
const failed = results.length - passed;
process.stdout.write(`\nRESULT  ${passed} passed, ${failed} failed, ${results.length} total\n`);
if (failed) process.exitCode = 1;
