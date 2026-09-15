import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

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
  const suppliedPath = process.env.DIALOGGG_PLAYWRIGHT_PATH;
  if (suppliedPath) return import(pathToFileURL(path.join(suppliedPath, "index.mjs")).href);
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is unavailable. Install it or set DIALOGGG_PLAYWRIGHT_PATH to the Playwright package directory.");
  }
}

function sessionCookie(response) {
  const value = response.headers.get("set-cookie")?.match(/dialoggg_session=([^;]+)/)?.[1];
  assert.ok(value, "authentication response did not include a Dialoggg session");
  return value;
}

async function addSession(context, value) {
  await context.addCookies([{ name: "dialoggg_session", value, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
}

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-company-admin-ui-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = Date.now().toString(36);
const platformEmail = `platform-admin-${suffix}@example.test`;
const tenantAdminEmail = `tenant-admin-${suffix}@example.test`;
const password = "Company-Admin-UI-Test-1!";

try {
  const playwright = await loadPlaywright();
  appServer = spawn(process.execPath, ["scripts/start-production.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), RAILWAY_VOLUME_MOUNT_PATH: dataDirectory },
    stdio: ["ignore", "pipe", "pipe"],
  });
  appServer.stdout.on("data", chunk => { appOutput += chunk.toString(); });
  appServer.stderr.on("data", chunk => { appOutput += chunk.toString(); });

  const startedAt = Date.now();
  while (true) {
    if (appServer.exitCode !== null) throw new Error(`Test server exited early.\n${appOutput}`);
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.status === 200) break;
    } catch {}
    if (Date.now() - startedAt > 25_000) throw new Error(`Test server did not start.\n${appOutput}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const platformRegistration = await fetch(`${baseUrl}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_name: "Platform Bootstrap", full_name: "Platform Administrator", email: platformEmail, password }) });
  const platformPayload = await platformRegistration.json();
  assert.equal(platformRegistration.status, 200, JSON.stringify(platformPayload));
  const platformCookie = sessionCookie(platformRegistration);
  const testDb = new Database(path.join(dataDirectory, "dialoggg.db"));
  try {
    testDb.prepare("UPDATE user SET user_type = 'super_admin', company_id = NULL WHERE id = ?").run(platformPayload.userId);
  } finally {
    testDb.close();
  }

  const tenantRegistration = await fetch(`${baseUrl}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_name: "Tenant QA Company", full_name: "Tenant Admin", email: tenantAdminEmail, password }) });
  assert.equal(tenantRegistration.status, 200, await tenantRegistration.text());
  const tenantCookie = sessionCookie(tenantRegistration);

  browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const platformContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await addSession(platformContext, platformCookie);
  const page = await platformContext.newPage();

  await check("Platform Administrator opens Companies with platform-only navigation", async () => {
    await page.goto(`${baseUrl}/platform/companies`);
    assert.equal(await page.title(), "Companies | Dialoggg");
    await page.getByRole("heading", { name: "Companies", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: /Companies/ }).count(), 1);
    assert.equal(await page.getByRole("link", { name: /All Projects/ }).count(), 0);
    const body = await page.locator("body").innerText();
    assert.match(body, /Sport Court of East PA/);
    assert.match(body, /Platform access boundary/);
  });

  await check("company filters provide a recoverable no-results state", async () => {
    await page.getByLabel("Search companies").fill("No company here");
    await page.getByRole("heading", { name: "No matching companies" }).waitFor();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByRole("button", { name: "Suspend Sport Court of East PA" }).waitFor();
    await page.getByLabel("Filter companies by status").selectOption("suspended");
    assert.equal(await page.getByText("Legacy Demo Company", { exact: true }).isVisible(), true);
    assert.equal(await page.getByText("Sport Court of East PA", { exact: true }).count(), 0);
    await page.getByLabel("Filter companies by status").selectOption("all");
  });

  await check("suspension explains every impact and supports cancel", async () => {
    await page.getByRole("button", { name: "Suspend Sport Court of East PA" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Suspend company?" });
    const text = await dialog.innerText();
    assert.match(text, /data is preserved/i);
    assert.match(text, /Google synchronization pauses/i);
    assert.match(text, /folders are not renamed or deleted/i);
    assert.match(text, /FUP-012/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Suspend Sport Court of East PA" }).waitFor();
  });

  await check("suspension and restoration update the preview with feedback", async () => {
    await page.getByRole("button", { name: "Suspend Sport Court of East PA" }).click();
    await page.getByRole("alertdialog", { name: "Suspend company?" }).getByRole("button", { name: "Suspend company" }).click();
    await page.getByRole("button", { name: "Restore Sport Court of East PA" }).waitFor();
    assert.match(await page.getByRole("status").innerText(), /was suspended/);
    await page.getByRole("button", { name: "Restore Sport Court of East PA" }).click();
    await page.getByRole("alertdialog", { name: "Restore company?" }).getByRole("button", { name: "Restore company" }).click();
    await page.getByRole("button", { name: "Suspend Sport Court of East PA" }).waitFor();
  });

  await check("company detail exposes metadata and preserves tenant privacy", async () => {
    await page.goto(`${baseUrl}/platform/companies/sport-court-east-pa`);
    await page.getByRole("heading", { name: "Sport Court of East PA", exact: true }).waitFor();
    const body = await page.locator("body").innerText();
    assert.match(body, /America\/New_York/);
    assert.match(body, /Integration health/);
    assert.match(body, /Tenant privacy boundary/);
    assert.match(body, /intentionally omits Project names/);
  });

  await check("detail lifecycle confirmation can suspend and restore", async () => {
    await page.getByRole("button", { name: "Suspend company" }).click();
    let dialog = page.getByRole("alertdialog", { name: "Suspend company?" });
    assert.match(await dialog.innerText(), /Microsoft folders stay exactly where they are/);
    await dialog.getByRole("button", { name: "Suspend company" }).click();
    await page.getByRole("button", { name: "Restore company" }).click();
    dialog = page.getByRole("alertdialog", { name: "Restore company?" });
    await dialog.getByRole("button", { name: "Restore company" }).click();
    await page.getByRole("button", { name: "Suspend company" }).waitFor();
  });

  await check("Add Company validates every required provisioning field", async () => {
    await page.goto(`${baseUrl}/platform/companies/new`);
    await page.getByRole("button", { name: "Review company setup" }).click();
    await page.getByText("Enter the Company Name.", { exact: true }).waitFor();
    await page.getByText("Choose the company's required time zone.", { exact: true }).waitFor();
    await page.getByText("Enter the first Owner's first name.", { exact: true }).waitFor();
    await page.getByText("Enter the first Owner's last name.", { exact: true }).waitFor();
    await page.getByText("Enter a valid Owner email address.", { exact: true }).waitFor();
  });

  await check("Add Company rejects duplicate names", async () => {
    await page.locator("#company-name").fill("sport court of east pa");
    await page.locator("#company-time-zone").selectOption("America/New_York");
    await page.locator("#owner-first-name").fill("Jamie");
    await page.locator("#owner-last-name").fill("Morgan");
    await page.locator("#owner-email").fill("jamie@example.test");
    await page.getByRole("button", { name: "Review company setup" }).click();
    await page.getByText("A company named “sport court of east pa” already exists.", { exact: true }).waitFor();
  });

  await check("company setup review repeats exact values and returns to edit", async () => {
    await page.locator("#company-name").fill("Keystone Court Builders");
    await page.getByRole("button", { name: "Review company setup" }).click();
    let dialog = page.getByRole("dialog", { name: "Confirm company setup" });
    const text = await dialog.innerText();
    assert.match(text, /Keystone Court Builders/);
    assert.match(text, /America\/New_York/);
    assert.match(text, /Jamie Morgan/);
    assert.match(text, /jamie@example.test/);
    await dialog.getByRole("button", { name: "Back to edit" }).click();
    assert.equal(await page.locator("#company-name").inputValue(), "Keystone Court Builders");
  });

  await check("Escape closes review without losing setup values", async () => {
    await page.getByRole("button", { name: "Review company setup" }).click();
    await page.getByRole("dialog", { name: "Confirm company setup" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog", { name: "Confirm company setup" }).count(), 0);
    assert.equal(await page.locator("#owner-email").inputValue(), "jamie@example.test");
  });

  await check("company setup confirmation remains explicitly non-persistent", async () => {
    await page.getByRole("button", { name: "Review company setup" }).click();
    await page.getByRole("dialog", { name: "Confirm company setup" }).getByRole("button", { name: "Confirm UI preview" }).click();
    await page.getByRole("heading", { name: "Company setup preview complete" }).waitFor();
    assert.match(await page.locator("body").innerText(), /no company or User was created and no invitation was sent/i);
  });

  await check("mobile Companies view has no horizontal page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/platform/companies`);
    await page.getByRole("heading", { name: "Companies", exact: true }).waitFor();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scrollWidth <= dimensions.width, `mobile page overflowed: ${JSON.stringify(dimensions)}`);
  });

  await check("tenant Admin receives restricted state without company data", async () => {
    const tenantContext = await browser.newContext();
    await addSession(tenantContext, tenantCookie);
    const tenantPage = await tenantContext.newPage();
    await tenantPage.goto(`${baseUrl}/platform/companies`);
    await tenantPage.getByRole("heading", { name: "Platform Administration is restricted" }).waitFor();
    assert.doesNotMatch(await tenantPage.locator("body").innerText(), /Sport Court of East PA|Northline Courts/);
    await tenantContext.close();
  });

  await check("signed-out company route returns to Login", async () => {
    const anonymousContext = await browser.newContext();
    const anonymousPage = await anonymousContext.newPage();
    await anonymousPage.goto(`${baseUrl}/platform/companies/sport-court-east-pa`);
    await anonymousPage.waitForURL("**/login");
    await anonymousPage.getByRole("heading", { name: /Log in to Dialoggg/i }).waitFor();
    await anonymousContext.close();
  });

  await platformContext.close();
} finally {
  if (browser) await browser.close();
  if (appServer && appServer.exitCode === null) {
    appServer.kill();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  await rm(dataDirectory, { recursive: true, force: true });
}

const passed = results.filter(result => result.status === "PASS").length;
const failed = results.length - passed;
process.stdout.write(`\nRESULT  ${passed} passed, ${failed} failed, ${results.length} total\n`);
if (failed) process.exitCode = 1;
