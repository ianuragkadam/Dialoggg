import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-users-access-ui-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = Date.now().toString(36);
const adminEmail = `users-admin-${suffix}@example.test`;
const viewerEmail = `users-viewer-${suffix}@example.test`;
const password = "Users-Access-UI-Test-1!";

try {
  const playwright = await loadPlaywright();
  prepareTestDatabase(dataDirectory);
  const admin = bootstrapAccount(dataDirectory, { companyName: "Users Access QA", fullName: "QA Administrator", email: adminEmail, password, role: "admin" });
  bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "QA Employee", email: viewerEmail, password, role: "employee" });
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

  const registration = await login(baseUrl, adminEmail, password);
  const adminCookie = sessionCookie(registration);
  const viewerLogin = await login(baseUrl, viewerEmail, password);
  const viewerCookie = sessionCookie(viewerLogin);

  browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await addSession(adminContext, adminCookie);
  const page = await adminContext.newPage();

  await check("Admin opens the approved company User directory", async () => {
    await page.goto(`${baseUrl}/users`);
    assert.equal(await page.title(), "Users | Dialoggg");
    await page.getByRole("heading", { name: "Users", exact: true }).waitFor();
    const body = await page.locator("body").innerText();
    assert.match(body, /Owner/);
    assert.match(body, /Admin/);
    assert.match(body, /Employee \(Internal\)/);
    assert.match(body, /External\/Client/);
    assert.match(body, /Invitation pending/);
  });

  await check("directory filters provide a recoverable no-results state", async () => {
    await page.getByLabel("Search Users").fill("No person here");
    await page.getByRole("heading", { name: "No matching Users" }).waitFor();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByText("Jamie Morgan", { exact: true }).waitFor();
    await page.getByLabel("Filter Users by Role").selectOption("external");
    assert.equal(await page.getByText("Alex Rivera", { exact: true }).isVisible(), true);
    assert.equal(await page.getByText("Jamie Morgan", { exact: true }).count(), 0);
    await page.getByLabel("Filter Users by Role").selectOption("all");
  });

  await check("Admin cannot change Owner or Admin lifecycle controls", async () => {
    const ownerButton = page.getByRole("button", { name: "Deactivate Scott Grote" });
    assert.equal(await ownerButton.isDisabled(), true);
    const adminArticle = page.locator("article").filter({ hasText: "Mehul Nahar" });
    assert.equal(await adminArticle.getByRole("button", { name: /Deactivate|Restore/ }).count(), 0);
    assert.equal(await adminArticle.getByRole("link", { name: "View" }).count(), 1);
  });

  await check("directory deactivation explains impact and supports cancel", async () => {
    await page.getByRole("button", { name: "Deactivate Jamie Morgan" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Deactivate User?" });
    const text = await dialog.innerText();
    assert.match(text, /sessions are revoked/i);
    assert.match(text, /Historical Project assignments remain visible/i);
    assert.match(text, /Linked Resource records remain separate/i);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Deactivate Jamie Morgan" }).waitFor();
  });

  await check("directory deactivation and restoration update the preview", async () => {
    await page.getByRole("button", { name: "Deactivate Jamie Morgan" }).click();
    await page.getByRole("alertdialog", { name: "Deactivate User?" }).getByRole("button", { name: "Deactivate User" }).click();
    await page.getByRole("button", { name: "Restore Jamie Morgan" }).waitFor();
    assert.match(await page.getByRole("status").innerText(), /was deactivated/);
    await page.getByRole("button", { name: "Restore Jamie Morgan" }).click();
    await page.getByRole("alertdialog", { name: "Restore User?" }).getByRole("button", { name: "Restore User" }).click();
    await page.getByRole("button", { name: "Deactivate Jamie Morgan" }).waitFor();
  });

  await check("Invite User validates every required identity field", async () => {
    await page.goto(`${baseUrl}/users/new`);
    await page.getByRole("button", { name: "Review invitation" }).click();
    await page.getByText("Enter the User's first name.", { exact: true }).waitFor();
    await page.getByText("Enter the User's last name.", { exact: true }).waitFor();
    await page.getByText("Enter a valid login email address.", { exact: true }).waitFor();
  });

  await check("Invite User rejects an existing company login email", async () => {
    await page.locator("#invite-first-name").fill("Alex");
    await page.locator("#invite-last-name").fill("Duplicate");
    await page.locator("#invite-email").fill("alex.client@example.test");
    await page.getByRole("button", { name: "Review invitation" }).click();
    await page.getByText("A User with this login email already belongs to the company.", { exact: true }).waitFor();
  });

  await check("External invitation requires at least one Project", async () => {
    await page.locator("#invite-email").fill("new.client@example.test");
    await page.locator("#invite-role").selectOption("external");
    await page.getByRole("button", { name: "Review invitation" }).click();
    await page.getByText("Assign an External/Client to at least one Project.", { exact: true }).waitFor();
  });

  await check("invitation review repeats exact access, Resource, and security choices", async () => {
    await page.getByLabel(/Reading Residence Court/).check();
    await page.getByLabel("Also add as a Resource").check();
    await page.getByRole("button", { name: "Review invitation" }).click();
    let dialog = page.getByRole("dialog", { name: "Confirm User invitation" });
    const text = await dialog.innerText();
    assert.match(text, /Alex Duplicate/);
    assert.match(text, /new\.client@example\.test/);
    assert.match(text, /External\/Client/);
    assert.match(text, /Reading Residence Court/);
    assert.match(text, /Create and link/);
    assert.match(text, /72-hour invitation/);
    await dialog.getByRole("button", { name: "Back to edit" }).click();
    assert.equal(await page.locator("#invite-email").inputValue(), "new.client@example.test");
  });

  await check("Escape closes invitation review without losing values", async () => {
    await page.getByRole("button", { name: "Review invitation" }).click();
    await page.getByRole("dialog", { name: "Confirm User invitation" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog", { name: "Confirm User invitation" }).count(), 0);
    assert.equal(await page.getByLabel(/Reading Residence Court/).isChecked(), true);
  });

  await check("invitation confirmation remains explicitly non-persistent", async () => {
    await page.getByRole("button", { name: "Review invitation" }).click();
    await page.getByRole("dialog", { name: "Confirm User invitation" }).getByRole("button", { name: "Confirm UI preview" }).click();
    await page.getByRole("heading", { name: "Invitation preview complete" }).waitFor();
    assert.match(await page.locator("body").innerText(), /no User, membership, Resource, Project assignment, or invitation was created/i);
  });

  await check("Owner detail locks profile, lifecycle, Role, and Project access", async () => {
    await page.goto(`${baseUrl}/users/scott-grote`);
    await page.getByRole("heading", { name: "Scott Grote", exact: true }).waitFor();
    const body = await page.locator("body").innerText();
    assert.match(body, /Owner approval required/);
    assert.equal(await page.getByRole("button", { name: "Owner required" }).first().isDisabled(), true);
    assert.equal(await page.getByRole("link", { name: /Manage Project access|Edit assignments/ }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Deactivate User" }).count(), 0);
  });

  await check("direct Owner Project-access route remains read-only for Admin", async () => {
    await page.goto(`${baseUrl}/users/scott-grote/projects`);
    await page.getByRole("heading", { name: "Project access" }).waitFor();
    const body = await page.locator("body").innerText();
    assert.match(body, /Owner approval required/);
    assert.match(body, /Owner\/Admin assignment context/);
    assert.doesNotMatch(body, /Employee \(Internal\) behavior/);
    assert.equal(await page.getByRole("button", { name: "Owner required" }).isDisabled(), true);
    const checkboxes = page.getByRole("checkbox");
    for (let index = 0; index < await checkboxes.count(); index += 1) assert.equal(await checkboxes.nth(index).isDisabled(), true);
  });

  await check("Employee details validate edits and review Role boundary changes", async () => {
    await page.goto(`${baseUrl}/users/jamie-morgan`);
    await page.getByRole("button", { name: "Edit details" }).click();
    await page.locator("#edit-first-name").fill("");
    await page.getByRole("dialog", { name: "Edit User details" }).getByRole("button", { name: "Save UI preview" }).click();
    await page.getByText("Enter a first name, last name, and valid login email.", { exact: true }).waitFor();
    await page.locator("#edit-first-name").fill("Jamie Updated");
    await page.getByRole("dialog", { name: "Edit User details" }).getByRole("button", { name: "Save UI preview" }).click();
    await page.getByRole("heading", { name: "Jamie Updated Morgan", exact: true }).waitFor();
    await page.locator("#detail-role").selectOption("external");
    await page.getByRole("button", { name: "Review Role change" }).click();
    const dialog = page.getByRole("dialog", { name: "Change company Role?" });
    assert.match(await dialog.innerText(), /limited to assigned Projects immediately/i);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  await check("pending invitation can be resent or cancelled with confirmation", async () => {
    await page.goto(`${baseUrl}/users/priya-shah`);
    await page.getByRole("button", { name: "Resend 72-hour invitation" }).click();
    let dialog = page.getByRole("dialog", { name: "Resend invitation?" });
    assert.match(await dialog.innerText(), /single-use link/);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Cancel invitation" }).click();
    dialog = page.getByRole("alertdialog", { name: "Cancel invitation?" });
    assert.match(await dialog.innerText(), /unused invitation link will stop working/i);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  await check("External Project access prevents removing the final Project", async () => {
    await page.goto(`${baseUrl}/users/alex-rivera/projects`);
    await page.getByLabel(/Reading Residence Court/).uncheck();
    await page.getByRole("button", { name: "Review access changes" }).click();
    await page.getByText("An External/Client must remain assigned to at least one Project.", { exact: true }).waitFor();
  });

  await check("Project access review shows exact additions and removals", async () => {
    await page.getByLabel(/Wilson School Gym/).check();
    await page.getByRole("button", { name: "Review access changes" }).click();
    let dialog = page.getByRole("dialog", { name: "Confirm Project access changes" });
    const text = await dialog.innerText();
    assert.match(text, /Wilson School Gym/);
    assert.match(text, /Reading Residence Court/);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
    assert.equal(await page.getByLabel(/Wilson School Gym/).isChecked(), true);
    await page.getByRole("button", { name: "Review access changes" }).click();
    dialog = page.getByRole("dialog", { name: "Confirm Project access changes" });
    await dialog.getByRole("button", { name: "Confirm UI preview" }).click();
    await page.getByRole("heading", { name: "Project access preview complete" }).waitFor();
    assert.match(await page.locator("body").innerText(), /no Project access, Common-folder eligibility, notification, calendar, or session state changed/i);
  });

  await check("mobile Users view has no horizontal page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/users`);
    await page.getByRole("heading", { name: "Users", exact: true }).waitFor();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scrollWidth <= dimensions.width, `mobile page overflowed: ${JSON.stringify(dimensions)}`);
  });

  await check("Employee receives a restricted state on every management route", async () => {
    const viewerContext = await browser.newContext();
    await addSession(viewerContext, viewerCookie);
    const viewerPage = await viewerContext.newPage();
    for (const route of ["/users", "/users/new", "/users/jamie-morgan", "/users/jamie-morgan/projects"]) {
      await viewerPage.goto(`${baseUrl}${route}`);
      await viewerPage.getByRole("heading", { name: /restricted/i }).waitFor();
      assert.doesNotMatch(await viewerPage.locator("body").innerText(), /Scott Grote|Alex Rivera/);
    }
    await viewerContext.close();
  });

  await check("signed-out User management routes return to Login", async () => {
    const anonymousContext = await browser.newContext();
    const anonymousPage = await anonymousContext.newPage();
    for (const route of ["/users", "/users/new", "/users/jamie-morgan", "/users/jamie-morgan/projects"]) {
      await anonymousPage.goto(`${baseUrl}${route}`);
      await anonymousPage.waitForURL("**/login");
      await anonymousPage.getByRole("heading", { name: /Log in to Dialoggg/i }).waitFor();
    }
    await anonymousContext.close();
  });

  await adminContext.close();
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
