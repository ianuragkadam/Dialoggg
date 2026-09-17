import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type SecretEnvelope = {
  v: 1;
  alg: "A256GCM";
  iv: string;
  tag: string;
  ciphertext: string;
};

function rootKey() {
  const encoded = process.env.APP_ENCRYPTION_KEY;
  if (!encoded) throw new Error("APP_ENCRYPTION_KEY_REQUIRED");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY_INVALID");
  return key;
}

function canonical(value: Record<string, string>) {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

export function encryptIntegrationSecret(value: Record<string, string>, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", rootKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(canonical(value), "utf8"), cipher.final()]);
  const envelope: SecretEnvelope = {
    v: 1,
    alg: "A256GCM",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(envelope);
}

export function decryptIntegrationSecret(value: string, context: string): Record<string, string> {
  const envelope = JSON.parse(value) as SecretEnvelope;
  if (envelope.v !== 1 || envelope.alg !== "A256GCM") throw new Error("SECRET_ENVELOPE_UNSUPPORTED");
  const decipher = createDecipheriv("aes-256-gcm", rootKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("SECRET_PAYLOAD_INVALID");
  return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, String(item)]));
}

export function integrationSecretFingerprint(value: Record<string, string>) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex").slice(0, 12);
}

export function integrationSecretLastFour(value: string) {
  return value.slice(-4).padStart(Math.min(4, value.length), "•");
}
