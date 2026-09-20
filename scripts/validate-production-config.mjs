import path from "node:path";

export function productionConfigErrors(environment = process.env) {
  if (environment.NODE_ENV !== "production") return [];
  const errors = [];

  const baseUrl = environment.APP_BASE_URL?.trim();
  try {
    const parsed = new URL(baseUrl || "");
    if (
      parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.pathname !== "/" || parsed.search || parsed.hash
    ) errors.push("APP_BASE_URL must be one canonical HTTPS origin without credentials, path, query, or fragment.");
  } catch {
    errors.push("APP_BASE_URL must be one canonical HTTPS origin without credentials, path, query, or fragment.");
  }

  const volumePath = environment.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  if (!volumePath || !path.isAbsolute(volumePath)) errors.push("RAILWAY_VOLUME_MOUNT_PATH must be an absolute persistent-volume path.");

  const encodedKey = environment.APP_ENCRYPTION_KEY?.trim() || "";
  const decodedKey = /^[A-Za-z0-9+/]+={0,2}$/.test(encodedKey) ? Buffer.from(encodedKey, "base64") : Buffer.alloc(0);
  if (decodedKey.length !== 32) errors.push("APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");

  if (environment.INTEGRATION_PROVIDER_MODE === "fake") errors.push("INTEGRATION_PROVIDER_MODE=fake is forbidden in production startup.");
  return errors;
}

export function assertProductionConfig(environment = process.env) {
  const errors = productionConfigErrors(environment);
  if (errors.length) throw new Error(`Production configuration rejected:\n- ${errors.join("\n- ")}`);
}
