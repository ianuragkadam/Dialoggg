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
  return import("playwright").catch(() => {
    throw new Error("Playwright is unavailable. Set DIALOGGG_PLAYWRIGHT_PATH.");
  });
}

function authCookies(response) {
  const header = response.headers.get("set-cookie") || "";
  const session = header.match(/dialoggg_session=([^;]+)/)?.[1];
  const csrf = header.match(/dialoggg_csrf=([^;]+)/)?.[1];
  assert.ok(session && csrf, "authentication response did not include session and CSRF cookies");
  return { session, csrf };
}

async function addSession(context, values) {
  await context.addCookies([
    { name: "dialoggg_session", value: values.session, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
    { name: "dialoggg_csrf", value: values.csrf, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Strict" },
  ]);
}

async function exerciseRoutes(browser, baseUrl, viewport, session, routes) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) runtimeErrors.push(message.text());
  });
  page.on("response", response => {
    if (response.url().startsWith(baseUrl) && response.status() >= 500) runtimeErrors.push(`${response.status()} ${response.url()}`);
  });

  const signedOut = await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  assert.equal(signedOut?.status(), 200);
  assert.match(signedOut?.headers()["strict-transport-security"] || "", /max-age=63072000/);
  const loginPassword = page.getByLabel("Password", { exact: true });
  await loginPassword.fill("visibility-check");
  await page.getByRole("button", { name: "Show password" }).click();
  assert.equal(await loginPassword.getAttribute("type"), "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  assert.equal(await loginPassword.getAttribute("type"), "password");
  await addSession(context, session);

  for (const route of routes) {
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    assert.ok(response && response.status() < 400, `${route} returned ${response?.status()}`);
    await page.waitForTimeout(100);
    const body = await page.locator("body").innerText();
    assert.ok(body.trim().length > 20, `${route} rendered no usable content`);
    assert.doesNotMatch(body, /Application error|Internal Server Error/i, `${route} rendered a fatal error`);
    const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(size.scrollWidth <= size.width + 1, `${route} overflowed the viewport: ${JSON.stringify(size)}`);
  }

  await page.keyboard.press("Tab");
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY", "keyboard focus did not enter the page");
  if (viewport.width < 1024) {
    const navigation = page.locator("#primary-navigation");
    const closed = await navigation.boundingBox();
    assert.ok(closed && closed.x < 0, `mobile navigation was open by default: ${JSON.stringify(closed)}`);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.waitForTimeout(400);
    const opened = await navigation.boundingBox();
    assert.ok(opened && opened.x >= 0, `mobile navigation did not open: ${JSON.stringify(opened)}`);
    await page.getByRole("button", { name: "Close navigation" }).first().click();
  }
  assert.deepEqual(runtimeErrors, [], runtimeErrors.join(" | "));
  await context.close();
}

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-release-matrix-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = Date.now().toString(36);
const password = "Release-Matrix-Test-1!";
const adminEmail = `release-admin-${suffix}@example.test`;
const platformEmail = `release-platform-${suffix}@example.test`;

try {
  const playwright = await loadPlaywright();
  prepareTestDatabase(dataDirectory);
  bootstrapAccount(dataDirectory, { companyName: "Release Matrix Company", fullName: "Release Admin", email: adminEmail, password, role: "admin" });
  bootstrapAccount(dataDirectory, { fullName: "Release Platform", email: platformEmail, password, platform: true });

  appServer = spawn(process.execPath, ["scripts/start-production.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      RAILWAY_VOLUME_MOUNT_PATH: dataDirectory,
      APP_BASE_URL: baseUrl,
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 29).toString("base64"),
      INTEGRATION_PROVIDER_MODE: "fake",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  appServer.stdout.on("data", chunk => { appOutput += chunk.toString(); });
  appServer.stderr.on("data", chunk => { appOutput += chunk.toString(); });

  const startedAt = Date.now();
  while (true) {
    if (appServer.exitCode !== null) throw new Error(`Release matrix server exited early.\n${appOutput}`);
    try { if ((await fetch(`${baseUrl}/api/health/ready`)).status === 200) break; } catch {}
    if (Date.now() - startedAt > 30_000) throw new Error(`Release matrix server did not start.\n${appOutput}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const adminSession = authCookies(await login(baseUrl, adminEmail, password));
  const platformSession = authCookies(await login(baseUrl, platformEmail, password));
  const adminRoutes = [
    "/projects", "/templates", "/resources", "/resources/schedule", "/calendar", "/users",
    "/settings/project-types", "/settings/microsoft-storage", "/account", "/account/google-calendar", "/help",
  ];
  const platformRoutes = ["/platform/companies", "/platform/companies/new", "/platform/integration-setup"];
  const matrix = [
    { name: "desktop", viewport: { width: 1440, height: 1000 } },
    { name: "phone", viewport: { width: 390, height: 844 } },
  ];

  for (const channel of ["chrome", "msedge"]) {
    const browser = await playwright.chromium.launch({ channel, headless: true });
    process.stdout.write(`BROWSER  ${channel} ${browser.version()}\n`);
    try {
      for (const target of matrix) {
        await check(`${channel} ${target.name} company application matrix`, () => exerciseRoutes(browser, baseUrl, target.viewport, adminSession, adminRoutes));
        await check(`${channel} ${target.name} Platform Administration matrix`, () => exerciseRoutes(browser, baseUrl, target.viewport, platformSession, platformRoutes));
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  if (appServer && appServer.exitCode === null) {
    appServer.kill();
    await new Promise(resolve => appServer.once("exit", resolve));
  }
  await rm(dataDirectory, { recursive: true, force: true });
}

const failed = results.filter(result => result.status === "FAIL");
process.stdout.write(`\nRESULT  ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total\n`);
if (failed.length) process.exitCode = 1;
