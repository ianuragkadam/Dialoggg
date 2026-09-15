import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-project-templates-ui-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = Date.now().toString(36);
const adminEmail = `project-templates-admin-${suffix}@example.test`;
const viewerEmail = `project-templates-viewer-${suffix}@example.test`;
const password = "Project-Templates-Test-1!";

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

  browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ company_name: "Project Templates QA Company", full_name: "Project Templates Admin", email: adminEmail, password }),
  });
  assert.equal(registration.status, 200, await registration.text());
  const adminCookie = sessionCookie(registration);
  await addSession(adminContext, adminCookie);
  const page = await adminContext.newPage();

  await check("admin opens the Template Library with approved examples", async () => {
    await page.goto(`${baseUrl}/templates`);
    assert.equal(await page.title(), "Project Templates | Dialoggg");
    await page.getByRole("heading", { name: "Project Templates", exact: true }).waitFor();
    const body = await page.locator("body").innerText();
    assert.match(body, /UI preview/);
    assert.match(body, /Backyard Court/);
    assert.match(body, /Commercial Athletic Surface/);
    assert.match(body, /Court Resurfacing/);
  });

  await check("Template search provides a recoverable no-results state", async () => {
    await page.getByLabel("Search Project Templates").fill("No template here");
    await page.getByRole("heading", { name: "No matching Templates" }).waitFor();
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.getByRole("button", { name: "Rename Backyard Court" }).waitFor();
  });

  await check("rename validates duplicates and saves without changing Projects", async () => {
    await page.getByRole("button", { name: "Rename Backyard Court" }).click();
    let dialog = page.getByRole("dialog", { name: "Rename Template" });
    const input = dialog.locator("#template-name");
    await page.waitForFunction(() => document.activeElement?.id === "template-name");
    await input.fill("court resurfacing");
    await dialog.getByRole("button", { name: "Save new name" }).click();
    assert.match(await dialog.getByRole("alert").innerText(), /already exists/i);
    await input.fill("Residential Court");
    await dialog.getByRole("button", { name: "Save new name" }).click();
    await page.getByRole("button", { name: "Rename Residential Court" }).waitFor();
    assert.match(await page.getByRole("status").innerText(), /Existing Projects were not changed/);
  });

  await check("changed rename protects against accidental dismissal", async () => {
    await page.getByRole("button", { name: "Rename Commercial Athletic Surface" }).click();
    let dialog = page.getByRole("dialog", { name: "Rename Template" });
    await dialog.locator("#template-name").fill("Temporary commercial name");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    let discard = page.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    await discard.getByRole("button", { name: "Keep editing" }).click();
    dialog = page.getByRole("dialog", { name: "Rename Template" });
    assert.equal(await dialog.locator("#template-name").inputValue(), "Temporary commercial name");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    discard = page.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    await discard.getByRole("button", { name: "Discard changes" }).click();
  });

  await check("Template deletion supports safe cancel and explicit confirmation", async () => {
    await page.getByRole("button", { name: "Delete Court Resurfacing" }).click();
    let dialog = page.getByRole("alertdialog", { name: "Delete Template?" });
    assert.match(await dialog.innerText(), /Existing Projects created from it will not change/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Delete Court Resurfacing" }).click();
    dialog = page.getByRole("alertdialog", { name: "Delete Template?" });
    await dialog.getByRole("button", { name: "Delete Template" }).click();
    assert.equal(await page.getByRole("button", { name: "Delete Court Resurfacing" }).count(), 0);
  });

  await check("Template detail route explains offsets and original Gantt boundary", async () => {
    await page.goto(`${baseUrl}/templates/backyard-court`);
    await page.getByRole("heading", { name: "Backyard Court", exact: true }).waitFor();
    const body = await page.locator("body").innerText();
    assert.match(body, /Project Plan preview/);
    assert.match(body, /relative working-day offsets/);
    assert.match(body, /no separate Template schedule editor/);
  });

  await check("save-from-Project validates, reviews, and preserves provisional Resource choice", async () => {
    await page.goto(`${baseUrl}/templates/new`);
    await page.getByRole("button", { name: "Review Template" }).click();
    await page.getByText("Choose the Project Plan to save.", { exact: true }).waitFor();
    await page.getByText("Enter a Template name.", { exact: true }).waitFor();
    await page.locator("#source-project").selectOption({ label: "Miller Residence" });
    await page.locator("#new-template-name").fill("backyard court");
    await page.getByRole("button", { name: "Review Template" }).click();
    await page.getByText("A Template named “backyard court” already exists.", { exact: true }).waitFor();
    await page.locator("#new-template-name").fill("Residential Pickleball Court");
    await page.getByLabel("Also save current Resource assignments").check();
    await page.getByRole("button", { name: "Review Template" }).click();
    await page.getByRole("heading", { name: "Template preview complete" }).waitFor();
    assert.match(await page.locator("body").innerText(), /no Template or Project record was created/);
  });

  await check("start-from-Template validates and shows an exact confirmation", async () => {
    await page.goto(`${baseUrl}/templates/backyard-court/use`);
    await page.getByRole("button", { name: "Review Project setup" }).click();
    await page.getByText("Enter a Project name.", { exact: true }).waitFor();
    await page.getByText("Choose exactly one Project Type.", { exact: true }).waitFor();
    await page.getByText("Choose the Project Start Date.", { exact: true }).waitFor();
    await page.locator("#template-project-name").fill("Johnson Residence");
    await page.locator("#template-project-type").selectOption("Acrylic");
    await page.locator("#template-start-date").fill("2026-10-05");
    await page.locator("#template-client-name").fill("Alex Johnson");
    await page.getByRole("button", { name: "Review Project setup" }).click();
    let dialog = page.getByRole("dialog", { name: "Confirm Project setup" });
    const text = await dialog.innerText();
    assert.match(text, /Johnson Residence/);
    assert.match(text, /Acrylic/);
    assert.match(text, /2026-10-05/);
    assert.match(text, /18 at 0%/);
    await dialog.getByRole("button", { name: "Back to edit" }).click();
    await page.getByRole("button", { name: "Review Project setup" }).click();
    dialog = page.getByRole("dialog", { name: "Confirm Project setup" });
    await dialog.getByRole("button", { name: "Confirm UI preview" }).click();
    await page.getByRole("heading", { name: "Project setup preview confirmed" }).waitFor();
    assert.match(await page.locator("body").innerText(), /existing original Project Plan\/Gantt chart/);
  });

  await check("Escape closes the Project setup confirmation without losing fields", async () => {
    await page.getByRole("button", { name: "Review setup" }).click();
    await page.getByRole("button", { name: "Review Project setup" }).click();
    await page.getByRole("dialog", { name: "Confirm Project setup" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog", { name: "Confirm Project setup" }).count(), 0);
    assert.equal(await page.locator("#template-project-name").inputValue(), "Johnson Residence");
  });

  await check("mobile Template Library has no horizontal page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/templates`);
    await page.getByRole("heading", { name: "Project Templates", exact: true }).waitFor();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scrollWidth <= dimensions.width, `mobile page overflowed: ${JSON.stringify(dimensions)}`);
  });

  const viewerCreation = await fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `dialoggg_session=${adminCookie}` },
    body: JSON.stringify({ full_name: "Project Templates Employee", email: viewerEmail, password, role: "viewer" }),
  });
  assert.equal(viewerCreation.status, 200, await viewerCreation.text());
  const viewerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: viewerEmail, password }) });
  assert.equal(viewerLogin.status, 200, await viewerLogin.text());

  await check("Employee sees restriction without Template business data", async () => {
    const viewerContext = await browser.newContext();
    await addSession(viewerContext, sessionCookie(viewerLogin));
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto(`${baseUrl}/templates/backyard-court`);
    await viewerPage.getByRole("heading", { name: "Project Templates are restricted" }).waitFor();
    assert.doesNotMatch(await viewerPage.locator("body").innerText(), /Miller Residence|Westfield Recreation Center/);
    await viewerContext.close();
  });

  await check("signed-out direct Template route returns to Login", async () => {
    const anonymousContext = await browser.newContext();
    const anonymousPage = await anonymousContext.newPage();
    await anonymousPage.goto(`${baseUrl}/templates/backyard-court/use`);
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
