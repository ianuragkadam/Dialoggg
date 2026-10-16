import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(root, "src", "app", "api");

async function collectRoutes(directory = apiRoot) {
  const routes = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) routes.push(...await collectRoutes(entryPath));
    else if (entry.name === "route.ts") routes.push(entryPath);
  }
  return routes.sort();
}

async function collectSources(directory) {
  const sources = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) sources.push(...await collectSources(entryPath));
    else if (/\.tsx?$/.test(entry.name)) sources.push(entryPath);
  }
  return sources.sort();
}

function relativeRoute(file) {
  return path.relative(apiRoot, file).replaceAll("\\", "/").replace(/\/route\.ts$/, "");
}

function exportsMethod(source, method) {
  return new RegExp(`export\\s+async\\s+function\\s+${method}\\b|export\\s*\\{[^}]*\\b${method}\\b`, "s").test(source);
}

test("release API inventory keeps every read and mutation behind its reviewed boundary", async () => {
  const files = await collectRoutes();
  assert.equal(files.length, 85, "API route inventory changed; perform and record a new route-by-route release review");

  const publicBearerReads = new Set([
    "health/ready",
    "ical/[token]",
    "requirements-review/[token]",
    "requirements/[token]",
  ]);
  const readGuard = /getCurrentActor|getCurrentUser|requireCompanyRole|integrationSession|export\s*\{/;
  const mutationGuard = /validateMutationRequest|validateRequestOrigin|validateIntegrationMutation|export\s*\{/;
  const mutationMethods = ["POST", "PUT", "PATCH", "DELETE"];

  for (const file of files) {
    const route = relativeRoute(file);
    const source = await readFile(file, "utf8");

    if (exportsMethod(source, "GET") && !publicBearerReads.has(route)) {
      assert.match(source, readGuard, `${route} GET is missing the reviewed actor/session boundary`);
    }

    for (const method of mutationMethods) {
      if (!exportsMethod(source, method)) continue;
      if (route === "auth/register") {
        assert.match(source, /status:\s*404/, "public registration must remain unavailable");
        continue;
      }
      assert.match(source, mutationGuard, `${route} ${method} is missing origin/CSRF validation or a reviewed re-export`);
    }
  }
});

test("release security defaults reject proxy-origin trust and caching of API data", async () => {
  const sourceFiles = await collectSources(path.join(root, "src"));
  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /x-forwarded-host|x-forwarded-proto/i, `${path.relative(root, file)} trusts a forwarded origin header`);
  }

  const nextConfig = await readFile(path.join(root, "next.config.mjs"), "utf8");
  assert.match(nextConfig, /source:\s*"\/api\/:path\*"/);
  assert.match(nextConfig, /private, no-store, max-age=0/);
});
