import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
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
  const suppliedPath = process.env.DIALOGGG_PLAYWRIGHT_PATH;
  if (suppliedPath) {
    return import(pathToFileURL(path.join(suppliedPath, "index.mjs")).href);
  }
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is unavailable. Install it or set DIALOGGG_PLAYWRIGHT_PATH to the Playwright package directory.");
  }
}

function authCookies(response) {
  const combined = response.headers.get("set-cookie") || "";
  const session = combined.match(/dialoggg_session=([^;]+)/)?.[1];
  const csrf = combined.match(/dialoggg_csrf=([^;]+)/)?.[1];
  assert.ok(session && csrf, "authentication response did not include Dialoggg session and CSRF cookies");
  return { session, csrf };
}

async function addSession(context, values) {
  await context.addCookies([{
    name: "dialoggg_session",
    value: values.session,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
  }, {
    name: "dialoggg_csrf",
    value: values.csrf,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Strict",
  }]);
}

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-project-types-ui-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = Date.now().toString(36);
const adminEmail = `project-types-admin-${suffix}@example.test`;
const viewerEmail = `project-types-viewer-${suffix}@example.test`;
const ownerEmail = `project-types-owner-${suffix}@example.test`;
const externalEmail = `project-types-external-${suffix}@example.test`;
const password = "Project-Types-Test-1!";

try {
  const playwright = await loadPlaywright();
  prepareTestDatabase(dataDirectory);
  const admin = bootstrapAccount(dataDirectory, { companyName: "Project Types QA Company", fullName: "Project Types Admin", email: adminEmail, password, role: "admin" });
  bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Project Types Employee", email: viewerEmail, password, role: "employee" });
  bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Project Types Owner", email: ownerEmail, password, role: "owner" });
  bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Project Types External", email: externalEmail, password, role: "external" });
  const database = new Database(path.join(dataDirectory, "dialoggg.db"));
  database.pragma("foreign_keys = ON");
  const insertType = database.prepare("INSERT INTO project_type (company_id, name, normalized_name) VALUES (?, ?, ?)");
  const acrylicId = Number(insertType.run(admin.companyId, "Acrylic", "acrylic").lastInsertRowid);
  insertType.run(admin.companyId, "Hardwood", "hardwood");
  const modularId = Number(insertType.run(admin.companyId, "Modular", "modular").lastInsertRowid);
  const insertProject = database.prepare("INSERT INTO project (company_id, project_type_id, name, start_date, created_by) VALUES (?, ?, ?, '2026-09-14', ?)");
  for (let index = 1; index <= 12; index += 1) insertProject.run(admin.companyId, acrylicId, `Acrylic Project ${String(index).padStart(2, "0")}`, admin.legacyUserId);
  for (let index = 1; index <= 2; index += 1) insertProject.run(admin.companyId, modularId, `Modular Project ${String(index).padStart(2, "0")}`, admin.legacyUserId);
  database.close();
  appServer = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      RAILWAY_VOLUME_MOUNT_PATH: dataDirectory,
      APP_BASE_URL: baseUrl,
    },
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

  browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const registration = await login(baseUrl, adminEmail, password);
  const adminCookie = authCookies(registration);
  await addSession(adminContext, adminCookie);
  const page = await adminContext.newPage();

  await check("admin opens the dedicated Project Types route", async () => {
    await page.goto(`${baseUrl}/settings/project-types`);
    assert.equal(await page.title(), "Project Types | Dialoggg");
    await page.getByRole("heading", { name: "Project Types", exact: true }).waitFor();
    assert.match(await page.locator("body").innerText(), /Live company setting/);
    assert.match(await page.locator("body").innerText(), /Acrylic/);
    assert.match(await page.locator("body").innerText(), /Hardwood/);
    assert.match(await page.locator("body").innerText(), /Modular/);
  });

  await check("create dialog focuses the name and validates duplicates", async () => {
    await page.getByRole("button", { name: "Add Project Type", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add Project Type" });
    await dialog.waitFor();
    const name = dialog.getByLabel("Project Type name *", { exact: true });
    assert.equal(await name.evaluate(element => element === document.activeElement), true);
    await name.fill("acrylic");
    await dialog.getByRole("button", { name: "Add Project Type", exact: true }).click();
    assert.match(await dialog.getByRole("alert").innerText(), /already exists/i);
  });

  await check("admin creates a Project Type and receives confirmation", async () => {
    const dialog = page.getByRole("dialog", { name: "Add Project Type" });
    await dialog.getByLabel("Project Type name *", { exact: true }).fill("Post-Tension");
    await dialog.getByRole("button", { name: "Add Project Type", exact: true }).click();
    await page.getByRole("status").waitFor();
    assert.match(await page.getByRole("status").innerText(), /Post-Tension was added/);
    await page.getByRole("button", { name: "Rename Post-Tension" }).waitFor();
  });

  await check("rename dialog explains impact and saves the new name", async () => {
    await page.getByRole("button", { name: "Rename Post-Tension" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename Project Type" });
    assert.match(await dialog.innerText(), /All Projects and Master Calendar filters/);
    await dialog.getByLabel("Project Type name *", { exact: true }).fill("Post-Tension Concrete");
    await dialog.getByRole("button", { name: "Save new name" }).click();
    await page.getByRole("button", { name: "Rename Post-Tension Concrete" }).waitFor();
    assert.match(await page.getByRole("status").innerText(), /was renamed to Post-Tension Concrete/);
    await page.reload();
    await page.getByRole("button", { name: "Rename Post-Tension Concrete" }).waitFor();
  });

  await check("search has a clear no-results recovery state", async () => {
    const search = page.getByLabel("Search Project Types");
    await search.fill("No such type");
    await page.getByRole("heading", { name: "No matching Project Types" }).waitFor();
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.getByRole("button", { name: "Rename Acrylic" }).waitFor();
  });

  await check("in-use Project Type deletion is safely blocked", async () => {
    await page.getByRole("button", { name: "Delete Acrylic" }).click();
    const dialog = page.getByRole("alertdialog", { name: "This Project Type can't be deleted" });
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /12 projects/i);
    assert.match(await dialog.innerText(), /Acrylic Project 01/);
    assert.match(await dialog.innerText(), /Nothing has been deleted/);
    assert.equal(await dialog.getByRole("button", { name: "Delete Project Type" }).count(), 0);
    await dialog.getByRole("button", { name: "Close" }).click();
  });

  await check("unused Project Type deletion supports cancel and confirmation", async () => {
    await page.getByRole("button", { name: "Delete Hardwood" }).click();
    let dialog = page.getByRole("alertdialog", { name: "Delete Project Type?" });
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /not assigned to any Projects/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Delete Hardwood" }).waitFor();
    await page.getByRole("button", { name: "Delete Hardwood" }).click();
    dialog = page.getByRole("alertdialog", { name: "Delete Project Type?" });
    await dialog.getByRole("button", { name: "Delete Project Type" }).click();
    await page.getByRole("button", { name: "Delete Hardwood" }).waitFor({ state: "detached" });
    assert.equal(await page.getByRole("button", { name: "Delete Hardwood" }).count(), 0);
    assert.match(await page.getByRole("status").innerText(), /Hardwood was deleted/);
    await page.reload();
    assert.equal(await page.getByRole("button", { name: "Delete Hardwood" }).count(), 0);
  });

  await check("changed editor protects against accidental dismissal", async () => {
    await page.getByRole("button", { name: "Add Project Type", exact: true }).click();
    let editorDialog = page.getByRole("dialog", { name: "Add Project Type" });
    await editorDialog.getByLabel("Project Type name *", { exact: true }).fill("Temporary type");
    await editorDialog.getByRole("button", { name: "Cancel" }).click();
    let discard = page.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    await discard.waitFor();
    await discard.getByRole("button", { name: "Keep editing" }).click();
    editorDialog = page.getByRole("dialog", { name: "Add Project Type" });
    assert.equal(await editorDialog.getByLabel("Project Type name *", { exact: true }).inputValue(), "Temporary type");
    await editorDialog.getByRole("button", { name: "Cancel" }).click();
    discard = page.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    await discard.getByRole("button", { name: "Discard changes" }).click();
    assert.equal(await page.getByText("Temporary type", { exact: true }).count(), 0);
  });

  await check("Escape closes an unchanged editor", async () => {
    await page.getByRole("button", { name: "Add Project Type", exact: true }).click();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog", { name: "Add Project Type" }).count(), 0);
  });

  await check("mobile layout uses cards without horizontal page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole("heading", { name: "Project Types", exact: true }).waitFor();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scrollWidth <= dimensions.width, `mobile page overflowed: ${JSON.stringify(dimensions)}`);
    assert.equal(await page.locator("article").filter({ hasText: "Acrylic" }).first().isVisible(), true);
    await mkdir(path.join(process.cwd(), ".tools"), { recursive: true });
    await page.screenshot({ path: path.join(process.cwd(), ".tools", "project-types-playwright-mobile.png"), fullPage: true });
  });

  const viewerLogin = await login(baseUrl, viewerEmail, password);
  const ownerLogin = await login(baseUrl, ownerEmail, password);
  const externalLogin = await login(baseUrl, externalEmail, password);

  await check("Owner can persist Project Type management actions", async () => {
    const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await addSession(ownerContext, authCookies(ownerLogin));
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(`${baseUrl}/settings/project-types`);
    await ownerPage.getByRole("button", { name: "Add Project Type", exact: true }).click();
    const editor = ownerPage.getByRole("dialog", { name: "Add Project Type" });
    await editor.getByLabel("Project Type name *", { exact: true }).fill("Owner Managed Type");
    await editor.getByRole("button", { name: "Add Project Type", exact: true }).click();
    await ownerPage.getByRole("button", { name: "Delete Owner Managed Type" }).waitFor();
    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: "Delete Owner Managed Type" }).click();
    const confirmation = ownerPage.getByRole("alertdialog", { name: "Delete Project Type?" });
    await confirmation.getByRole("button", { name: "Delete Project Type" }).click();
    await ownerPage.getByRole("button", { name: "Delete Owner Managed Type" }).waitFor({ state: "detached" });
    await ownerContext.close();
  });

  await check("Employee sees access restriction without Project Type data", async () => {
    const viewerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await addSession(viewerContext, authCookies(viewerLogin));
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto(`${baseUrl}/settings/project-types`);
    await viewerPage.getByRole("heading", { name: "Project Types are restricted" }).waitFor();
    const text = await viewerPage.locator("body").innerText();
    assert.doesNotMatch(text, /Acrylic|Hardwood|Modular/);
    await viewerContext.close();
  });

  await check("External sees access restriction without Project Type data", async () => {
    const externalContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await addSession(externalContext, authCookies(externalLogin));
    const externalPage = await externalContext.newPage();
    await externalPage.goto(`${baseUrl}/settings/project-types`);
    await externalPage.getByRole("heading", { name: "Project Types are restricted" }).waitFor();
    const text = await externalPage.locator("body").innerText();
    assert.doesNotMatch(text, /Acrylic|Hardwood|Modular|Post-Tension Concrete/);
    await externalContext.close();
  });

  await check("signed-out direct route returns to Login", async () => {
    const anonymousContext = await browser.newContext();
    const anonymousPage = await anonymousContext.newPage();
    await anonymousPage.goto(`${baseUrl}/settings/project-types`);
    await anonymousPage.waitForURL("**/login");
    await anonymousPage.getByRole("heading", { name: /Log in to Dialoggg/i }).waitFor();
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
