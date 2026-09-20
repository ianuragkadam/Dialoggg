import assert from "node:assert/strict";
import test from "node:test";
import { productionConfigErrors } from "../scripts/validate-production-config.mjs";

const valid = {
  NODE_ENV: "production",
  APP_BASE_URL: "https://dialoggg.example.com",
  RAILWAY_VOLUME_MOUNT_PATH: process.platform === "win32" ? "D:\\dialoggg-data" : "/data",
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("base64"),
};

test("production configuration accepts the complete persistent HTTPS contract", () => {
  assert.deepEqual(productionConfigErrors(valid), []);
});

test("production configuration fails closed without canonical URL, volume, or encryption key", () => {
  const errors = productionConfigErrors({ NODE_ENV: "production" });
  assert.equal(errors.length, 3);
  assert.match(errors.join("\n"), /APP_BASE_URL/);
  assert.match(errors.join("\n"), /RAILWAY_VOLUME_MOUNT_PATH/);
  assert.match(errors.join("\n"), /APP_ENCRYPTION_KEY/);
});

test("production configuration rejects insecure URLs, fake providers, and malformed keys", () => {
  const errors = productionConfigErrors({
    ...valid,
    APP_BASE_URL: "http://dialoggg.example.com/path",
    APP_ENCRYPTION_KEY: "not-base64",
    INTEGRATION_PROVIDER_MODE: "fake",
  });
  assert.equal(errors.length, 3);
});

test("non-production tooling remains independent of production-only secrets", () => {
  assert.deepEqual(productionConfigErrors({ NODE_ENV: "test" }), []);
});
