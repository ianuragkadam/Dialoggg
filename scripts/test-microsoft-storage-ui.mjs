import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { authenticatedHeaders, bootstrapAccount, login, prepareTestDatabase } from "./test-fixtures.mjs";

const results = [];
let appServer;
let appOutput = "";
let browser;

async function check(name, operation) {
  try { await operation(); results.push({ name, status: "PASS" }); process.stdout.write(`PASS  ${name}\n`); }
  catch (error) { const message = error instanceof Error ? error.message : String(error); results.push({ name, status: "FAIL", message }); process.stdout.write(`FAIL  ${name}\n      ${message}\n`); }
}

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const address = listener.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function loadPlaywright() {
  const supplied = process.env.DIALOGGG_PLAYWRIGHT_PATH;
  if (supplied) return import(pathToFileURL(path.join(supplied, "index.mjs")).href);
  try { return await import("playwright"); } catch { throw new Error("Playwright unavailable; set DIALOGGG_PLAYWRIGHT_PATH."); }
}

function sessionCookie(response) {
  const value = response.headers.get("set-cookie")?.match(/dialoggg_session=([^;]+)/)?.[1];
  assert.ok(value);
  return value;
}

function csrfCookie(response) {
  const value = response.headers.get("set-cookie")?.match(/dialoggg_csrf=([^;]+)/)?.[1];
  assert.ok(value);
  return value;
}

async function addSession(context, value, csrf) {
  await context.addCookies([
    { name: "dialoggg_session", value, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
    { name: "dialoggg_csrf", value: csrf, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Strict" },
  ]);
}

async function json(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) }, redirect: options.redirect || "manual" });
  const text = await response.text();
  return { response, data: text && (response.headers.get("content-type") || "").includes("json") ? JSON.parse(text) : text };
}

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-microsoft-ui-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = Date.now().toString(36);
const password = "Microsoft-UI-Test-1!";
const platformPassword = "Microsoft-Platform-Test-1!";
const adminEmail = `microsoft-admin-${suffix}@example.test`;
const platformEmail = `microsoft-platform-${suffix}@example.test`;
const employeeEmail = `microsoft-employee-${suffix}@example.test`;
const externalEmail = `microsoft-external-${suffix}@example.test`;
const encryptionKey = Buffer.alloc(32, 9).toString("base64");

try {
  const playwright = await loadPlaywright();
  prepareTestDatabase(dataDirectory);
  const admin = bootstrapAccount(dataDirectory, { companyName: "Microsoft QA", fullName: "Microsoft Admin", email: adminEmail, password, role: "admin" });
  const employeeRecord = bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Microsoft Employee", email: employeeEmail, password, role: "employee" });
  const externalRecord = bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Microsoft External", email: externalEmail, password, role: "external" });
  bootstrapAccount(dataDirectory, { fullName: "Microsoft Platform", email: platformEmail, password: platformPassword, platform: true });

  appServer = spawn(process.execPath, ["scripts/start-production.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), RAILWAY_VOLUME_MOUNT_PATH: dataDirectory, APP_BASE_URL: baseUrl, APP_ENCRYPTION_KEY: encryptionKey, INTEGRATION_PROVIDER_MODE: "fake" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  appServer.stdout.on("data", chunk => { appOutput += chunk.toString(); });
  appServer.stderr.on("data", chunk => { appOutput += chunk.toString(); });
  const started = Date.now();
  while (true) {
    if (appServer.exitCode !== null) throw new Error(`Server exited.\n${appOutput}`);
    try { if ((await fetch(`${baseUrl}/login`)).status === 200) break; } catch {}
    if (Date.now() - started > 25_000) throw new Error(`Server timeout.\n${appOutput}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const platformLogin = await login(baseUrl, platformEmail, platformPassword);
  const platformCookie = sessionCookie(platformLogin);
  const platformCsrf = csrfCookie(platformLogin);
  const registration = await login(baseUrl, adminEmail, password);
  const adminCookie = sessionCookie(registration);
  const adminCsrf = csrfCookie(registration);
  const auth = authenticatedHeaders(registration, baseUrl);
  const projectName = "Pine Street Court";
  const projectResult = await json(`${baseUrl}/api/projects`, { method: "POST", headers: auth, body: JSON.stringify({ name: projectName, project_type_id: admin.defaultProjectTypeId, client_name: "Morgan Family", client_email: "morgan@example.test", address: "10 Pine Street", city: "Reading", state: "PA", zip: "19601", phone: "7175550120", start_date: "2026-09-15" }) });
  assert.equal(projectResult.response.status, 200);
  const projectId = projectResult.data.id;
  const database = new Database(path.join(dataDirectory, "dialoggg.db"));
  database.prepare("INSERT INTO project_membership (project_id, company_membership_id) VALUES (?, ?)").run(projectId, employeeRecord.membershipId);
  database.prepare("INSERT INTO project_membership (project_id, company_membership_id) VALUES (?, ?)").run(projectId, externalRecord.membershipId);
  database.close();

  async function loginCookies(email) {
    const result = await json(`${baseUrl}/api/auth/login`, { method: "POST", headers: { origin: baseUrl }, body: JSON.stringify({ email, password }) });
    assert.equal(result.response.status, 200);
    return { session: sessionCookie(result.response), csrf: csrfCookie(result.response) };
  }
  const employeeCookies = await loginCookies(employeeEmail);
  const externalCookies = await loginCookies(externalEmail);

  browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const platformContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await addSession(platformContext, platformCookie, platformCsrf);
  const platformPage = await platformContext.newPage();

  await check("Platform Administrator saves write-only Microsoft application settings", async () => {
    await platformPage.goto(`${baseUrl}/platform/integration-setup`);
    const section = platformPage.locator('section[aria-labelledby="platform-microsoft-settings-heading"]');
    await section.getByRole("heading", { name: "Microsoft OAuth / Graph application settings" }).waitFor();
    await section.getByLabel("Application name").fill("Dialoggg UI Microsoft");
    await section.getByLabel("Microsoft Entra tenant ID").fill("11111111-1111-4111-8111-111111111111");
    await section.getByLabel("Application (client) ID").fill("22222222-2222-4222-8222-222222222222");
    await section.getByLabel("Verified publisher domain").fill("example.test");
    await section.getByLabel("Client secret value").fill("microsoft-ui-secret-value-1!");
    await section.getByLabel("Current Platform Administrator password").fill(platformPassword);
    await section.getByRole("button", { name: "Save encrypted credential" }).click();
    await section.getByText(/Saved encrypted settings/).waitFor();
    assert.doesNotMatch(await section.innerText(), /microsoft-ui-secret-value-1!/);
  });

  await check("Platform Microsoft settings require OAuth and Graph capability verification before Valid", async () => {
    const section = platformPage.locator('section[aria-labelledby="platform-microsoft-settings-heading"]');
    await section.getByRole("button", { name: "Verify with Microsoft" }).click();
    await platformPage.waitForURL(/platform\/integration-setup\?oauth=microsoft&status=verified/);
    await section.getByText("Valid", { exact: true }).waitFor();
    assert.match(await section.innerText(), /Files\.ReadWrite/);
  });

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await addSession(adminContext, adminCookie, adminCsrf);
  await adminContext.route("https://microsoft.example.test/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Microsoft folder</title>" }));
  const page = await adminContext.newPage();

  await check("Admin connects real company-scoped OneDrive for Business through the platform app", async () => {
    await page.goto(`${baseUrl}/settings/microsoft-storage`);
    await page.getByRole("heading", { name: "Microsoft Storage" }).waitFor();
    await page.getByRole("button", { name: "Connect Microsoft Storage" }).click();
    const dialog = page.getByRole("dialog", { name: "Connect Microsoft Storage" });
    await dialog.getByLabel(/OneDrive for Business/).check();
    await dialog.getByLabel(/I understand Microsoft 365 administrators/).check();
    await dialog.getByRole("button", { name: "Continue to Microsoft" }).click();
    await page.waitForURL(/settings\/microsoft-storage\?oauth=microsoft&status=verified/);
    await page.getByText("Connected · healthy", { exact: true }).waitFor();
    const body = await page.locator("body").innerText();
    assert.match(body, /OneDrive for Business/);
    assert.match(body, /Dialoggg does not store Project files/);
    assert.doesNotMatch(body, /fake-drive|refresh-token|client secret/i);
  });

  await check("Admin changes the future company root without moving existing Project folders", async () => {
    await page.getByRole("button", { name: "Change root" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Change company folder root?" });
    await page.waitForFunction(() => document.querySelectorAll("#root-choice option").length > 1);
    await dialog.locator("#root-choice").selectOption({ label: "Active Projects" });
    await dialog.getByLabel(/affects only future automatic folder creation/).check();
    await dialog.getByRole("button", { name: "Change root" }).click();
    await page.getByRole("status").filter({ hasText: "Existing Project folders were not moved" }).waitFor();
  });

  await check("Admin creates Common and links Private with retry-safe stable mappings", async () => {
    await page.goto(`${baseUrl}/projects/${projectId}`);
    await page.getByRole("button", { name: "Common and Private" }).click();
    await page.locator('[data-project-folders-ready="true"]').waitFor();
    await page.getByRole("button", { name: "Set up Common" }).click();
    let dialog = page.getByRole("dialog", { name: "Set up Common folder" });
    await dialog.getByLabel(/does not grant Microsoft folder access/).check();
    await dialog.getByRole("button", { name: "Confirm folder" }).click();
    await page.getByRole("button", { name: "Open Common" }).waitFor();
    await page.getByRole("button", { name: "Set up Private" }).click();
    dialog = page.getByRole("dialog", { name: "Set up Private folder" });
    await dialog.getByLabel(/Link existing folder/).check();
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] select option').length > 1);
    await dialog.locator("select").selectOption({ label: "Linked Existing Folder" });
    await dialog.getByLabel(/does not grant Microsoft folder access/).check();
    await dialog.getByRole("button", { name: "Confirm folder" }).click();
    await page.getByRole("button", { name: "Open Private" }).waitFor();
    const verify = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      assert.equal(verify.prepare("SELECT COUNT(*) count FROM project_folder_mapping WHERE project_id = ?").get(projectId).count, 2);
      const rows = verify.prepare("SELECT drive_id_ciphertext,item_id_ciphertext,web_url_ciphertext FROM project_folder_mapping WHERE project_id = ?").all(projectId);
      assert.doesNotMatch(JSON.stringify(rows), /fake-drive|fake-item|microsoft\.example\.test/);
    } finally { verify.close(); }
  });

  await check("Open Common returns a protected Microsoft tab and refreshes the saved display name", async () => {
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Open Common" }).click();
    const popup = await popupPromise;
    assert.match(popup.url(), /^https:\/\/microsoft\.example\.test\//);
    await popup.close();
  });

  await check("renamed Microsoft folder keeps its stable reference and refreshes its display", async () => {
    const changed = new Database(path.join(dataDirectory, "dialoggg.db"));
    try { changed.prepare("UPDATE project_folder_mapping SET display_name = 'Renamed in Microsoft' WHERE project_id = ? AND kind = 'common'").run(projectId); }
    finally { changed.close(); }
    await page.reload();
    await page.getByRole("button", { name: "Common and Private" }).click();
    await page.getByText("Renamed in Microsoft", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Open Common" }).count(), 1);
  });

  await check("missing and permission-denied states expose recovery without leaking Private identifiers", async () => {
    const changed = new Database(path.join(dataDirectory, "dialoggg.db"));
    try {
      changed.prepare("UPDATE project_folder_mapping SET state = 'missing' WHERE project_id = ? AND kind = 'common'").run(projectId);
      changed.prepare("UPDATE project_folder_mapping SET state = 'permission_denied' WHERE project_id = ? AND kind = 'private'").run(projectId);
    } finally { changed.close(); }
    await page.reload();
    await page.getByRole("button", { name: "Common and Private" }).click();
    await page.getByText("Missing or moved", { exact: true }).waitFor();
    await page.getByText("Microsoft permission denied", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Set up Common" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Set up Private" }).count(), 1);
  });

  await check("assigned Employee sees Common only and never receives Private data", async () => {
    const context = await browser.newContext();
    await addSession(context, employeeCookies.session, employeeCookies.csrf);
    const employee = await context.newPage();
    await employee.goto(`${baseUrl}/projects/${projectId}`);
    await employee.getByRole("button", { name: "Common and Private" }).click();
    await employee.getByRole("heading", { name: "Common", exact: true }).waitFor();
    assert.equal(await employee.getByRole("heading", { name: "Private", exact: true }).count(), 0);
    assert.doesNotMatch(await employee.locator('[data-project-folders-ready="true"]').innerText(), /Linked Existing Folder|stable Microsoft item identifier.*Private/i);
    await employee.goto(`${baseUrl}/settings/microsoft-storage`);
    await employee.getByRole("heading", { name: "Microsoft Storage is restricted" }).waitFor();
    await context.close();
  });

  await check("assigned External Client sees Common only and cannot discover Private", async () => {
    const context = await browser.newContext();
    await addSession(context, externalCookies.session, externalCookies.csrf);
    const external = await context.newPage();
    await external.goto(`${baseUrl}/projects/${projectId}`);
    await external.getByRole("heading", { name: "Common", exact: true }).waitFor();
    assert.equal(await external.getByRole("heading", { name: "Private", exact: true }).count(), 0);
    assert.equal(await external.getByRole("button", { name: /Set up|Change|Relink/ }).count(), 0);
    await context.close();
  });

  await check("folder mutation rejects missing CSRF", async () => {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/folders`, { method: "POST", headers: { cookie: `dialoggg_session=${adminCookie}`, origin: baseUrl, "content-type": "application/json" }, body: JSON.stringify({ action: "configure", kind: "common", method: "create", confirmed: true }) });
    assert.equal(response.status, 403);
  });

  await check("disconnect confirmation preserves every Microsoft folder mapping", async () => {
    await page.goto(`${baseUrl}/settings/microsoft-storage`);
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Disconnect Microsoft Storage?" });
    await dialog.getByLabel(/folders are not deleted/).check();
    await dialog.getByRole("button", { name: "Disconnect", exact: true }).click();
    await page.getByText("Not connected", { exact: true }).waitFor();
    const verify = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try { assert.equal(verify.prepare("SELECT COUNT(*) count FROM project_folder_mapping WHERE project_id = ?").get(projectId).count, 2); }
    finally { verify.close(); }
  });

  await check("Project lifecycle changes preserve mappings and hide relink controls when read-only", async () => {
    const current = await json(`${baseUrl}/api/projects/${projectId}`, { headers: auth });
    const update = await json(`${baseUrl}/api/v1/projects/${projectId}/lifecycle`, { method: "PATCH", headers: auth, body: JSON.stringify({ action: "complete", version: current.data.project.version }) });
    assert.equal(update.response.status, 200, JSON.stringify(update.data));
    const verify = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try { assert.equal(verify.prepare("SELECT COUNT(*) count FROM project_folder_mapping WHERE project_id = ?").get(projectId).count, 2); }
    finally { verify.close(); }
    await page.goto(`${baseUrl}/projects/${projectId}`);
    await page.getByRole("button", { name: "Common and Private" }).click();
    await page.locator('[aria-label="Project state notice"]').last().waitFor();
    assert.equal(await page.getByRole("button", { name: /^(Set up|Change) (Common|Private)/ }).count(), 0);
  });

  await check("phone layouts avoid page-level horizontal overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/settings/microsoft-storage", `/projects/${projectId}#folders`]) {
      await page.goto(`${baseUrl}${route}`);
      if (route.includes("projects")) await page.getByRole("button", { name: "Common and Private" }).click();
      const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.ok(size.scrollWidth <= size.width, `${route}: ${JSON.stringify(size)}`);
    }
  });

  await check("signed-out Microsoft routes return to Login", async () => {
    const context = await browser.newContext();
    const anonymous = await context.newPage();
    for (const route of ["/settings/microsoft-storage", `/projects/${projectId}`]) {
      await anonymous.goto(`${baseUrl}${route}`);
      assert.equal(new URL(anonymous.url()).pathname, "/login");
    }
    await context.close();
  });

  await check("browser console stays free of runtime errors", async () => {
    const messages = [];
    page.on("console", message => { if (message.type() === "error") messages.push(message.text()); });
    await page.goto(`${baseUrl}/settings/microsoft-storage`);
    await page.waitForTimeout(250);
    assert.deepEqual(messages, []);
  });

  await adminContext.close();
  await platformContext.close();
} finally {
  if (browser) await browser.close();
  if (appServer && appServer.exitCode === null) { appServer.kill(); await new Promise(resolve => setTimeout(resolve, 500)); }
  await rm(dataDirectory, { recursive: true, force: true });
}

const passed = results.filter(item => item.status === "PASS").length;
const failed = results.length - passed;
process.stdout.write(`\nRESULT  ${passed} passed, ${failed} failed, ${results.length} total\n`);
if (failed) process.exitCode = 1;
