import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";

import db from "../src/db/index";
import {
  EmailDeliveryError,
  decryptEmailPayload,
  processEmailOutbox,
  queueTransactionalEmail,
  retryEmailDelivery,
  type EmailSender,
} from "../src/lib/email-outbox";

function encryptCredential(value: Record<string, string>, context: string) {
  const key = Buffer.from(process.env.APP_ENCRYPTION_KEY!, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return JSON.stringify({ v: 1, alg: "A256GCM", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}

const future = new Date(Date.now() + 72 * 3_600_000).toISOString();
const expired = new Date(Date.now() - 3_600_000).toISOString();

const resendConfig = {
  sendingDomain: "verified.example.test",
  fromName: "Dialoggg",
  fromAddress: "notifications@verified.example.test",
  replyTo: "support@verified.example.test",
};
const configId = Number(db.prepare(`
  INSERT INTO integration_config (provider, scope_kind, environment, non_secret_json, status, credential_version, saved_at, verified_at)
  VALUES ('resend_platform', 'platform', 'test', ?, 'verified', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`).run(JSON.stringify(resendConfig)).lastInsertRowid);
db.prepare(`
  INSERT INTO integration_credential_version (config_id, version, encrypted_envelope, fingerprint, last_four)
  VALUES (?, 1, ?, 'test-fingerprint', 'alid')
`).run(configId, encryptCredential({ apiKey: "re_test_delivery_valid" }, `integration:${configId}:v1`));

const message = {
  to: "person@example.test",
  template: "invitation" as const,
  variables: {
    greeting: "Hello Person,",
    message: "You have been invited.",
    actionUrl: "https://example.test/accept#token=secret-token",
    expiresAt: future,
  },
};
queueTransactionalEmail({ kind: "invitation_email", idempotencyKey: "email:test:delivered", expiresAt: future, email: message });
queueTransactionalEmail({ kind: "invitation_email", idempotencyKey: "email:test:delivered", expiresAt: future, email: message });
const queued = db.prepare("SELECT id, payload_json, recipient_domain FROM outbox_job WHERE idempotency_key = 'email:test:delivered'").get() as any;
assert.equal(db.prepare("SELECT COUNT(*) count FROM outbox_job WHERE idempotency_key = 'email:test:delivered'").get().count, 1);
assert.equal(queued.recipient_domain, "example.test");
assert.doesNotMatch(queued.payload_json, /person@example\.test|secret-token/);
assert.equal(decryptEmailPayload(queued.payload_json).to, "person@example.test");

const delivered: EmailSender = Object.assign(async () => ({ providerMessageId: "provider-message-secret" }), {
  providerConfigId: configId,
  credentialVersion: 1,
});
const deliveredResult = await processEmailOutbox(delivered);
assert.equal(deliveredResult.delivered, 1);
const deliveredRow = db.prepare("SELECT status, attempts, provider_message_envelope FROM outbox_job WHERE id = ?").get(queued.id) as any;
assert.deepEqual({ status: deliveredRow.status, attempts: deliveredRow.attempts }, { status: "completed", attempts: 1 });
assert.ok(deliveredRow.provider_message_envelope);
assert.doesNotMatch(deliveredRow.provider_message_envelope, /provider-message-secret/);
assert.deepEqual(db.prepare("SELECT status, credential_version FROM email_delivery_attempt WHERE outbox_job_id = ?").get(queued.id), { status: "delivered", credential_version: 1 });

queueTransactionalEmail({ kind: "password_reset_email", idempotencyKey: "email:test:retry", expiresAt: future, email: { ...message, template: "password_reset" } });
const transient: EmailSender = Object.assign(async () => { throw new EmailDeliveryError("RESEND_PROVIDER_429", true, 429); }, { providerConfigId: configId, credentialVersion: 1 });
const transientResult = await processEmailOutbox(transient);
assert.equal(transientResult.failed, 1);
const retryRow = db.prepare("SELECT id, status, attempts, last_error_code, last_http_status FROM outbox_job WHERE idempotency_key = 'email:test:retry'").get() as any;
assert.deepEqual({ status: retryRow.status, attempts: retryRow.attempts, code: retryRow.last_error_code, http: retryRow.last_http_status }, { status: "retry", attempts: 1, code: "RESEND_PROVIDER_429", http: 429 });
retryEmailDelivery(retryRow.id);
assert.deepEqual(db.prepare("SELECT status, manual_retry_count FROM outbox_job WHERE id = ?").get(retryRow.id), { status: "retry", manual_retry_count: 1 });

queueTransactionalEmail({ kind: "operational_notification_email", idempotencyKey: "email:test:dead", expiresAt: future, email: { ...message, template: "operational", variables: { ...message.variables, subject: "Operational notice", actionLabel: "Review" } } });
const permanent: EmailSender = Object.assign(async () => { throw new EmailDeliveryError("RESEND_CREDENTIAL_REJECTED", false, 401); }, { providerConfigId: configId, credentialVersion: 1 });
const permanentResult = await processEmailOutbox(permanent);
assert.equal(permanentResult.failed, 2);
assert.deepEqual(db.prepare("SELECT status, failure_kind FROM outbox_job WHERE idempotency_key = 'email:test:dead'").get(), { status: "dead", failure_kind: "permanent" });
assert.equal((db.prepare("SELECT safe_status_code FROM integration_config WHERE id = ?").get(configId) as any).safe_status_code, "RESEND_CREDENTIAL_REJECTED");

db.prepare("UPDATE outbox_job SET next_attempt_at = datetime('now', '+1 day') WHERE idempotency_key = 'email:test:retry'").run();
queueTransactionalEmail({ kind: "invitation_email", idempotencyKey: "email:test:expired", expiresAt: expired, email: message });
const expiredResult = await processEmailOutbox(delivered);
assert.equal(expiredResult.expired, 1);
assert.deepEqual(db.prepare("SELECT status, last_error_code FROM outbox_job WHERE idempotency_key = 'email:test:expired'").get(), { status: "cancelled", last_error_code: "EMAIL_EXPIRED" });

db.prepare("UPDATE integration_config SET status = 'saved', verified_at = NULL WHERE id = ?").run(configId);
queueTransactionalEmail({ kind: "invitation_email", idempotencyKey: "email:test:deferred", expiresAt: future, email: message });
const deferredResult = await processEmailOutbox();
assert.equal(deferredResult.deferred, 1);
assert.deepEqual(db.prepare("SELECT status, attempts, last_error_code FROM outbox_job WHERE idempotency_key = 'email:test:deferred'").get(), { status: "retry", attempts: 0, last_error_code: "RESEND_CONFIGURATION_UNAVAILABLE" });

queueTransactionalEmail({ kind: "operational_notification_email", idempotencyKey: "email:test:stale-lock", expiresAt: future, email: { ...message, template: "operational" } });
const stale = db.prepare("SELECT id FROM outbox_job WHERE idempotency_key = 'email:test:stale-lock'").get() as { id: number };
db.prepare(`
  UPDATE outbox_job SET status = 'running', attempts = 1, locked_at = datetime('now', '-20 minutes'), locked_by = 'crashed-worker'
  WHERE id = ?
`).run(stale.id);
db.prepare(`
  INSERT INTO email_delivery_attempt (outbox_job_id, attempt_number, credential_version, status, started_at)
  VALUES (?, 1, 1, 'started', datetime('now', '-20 minutes'))
`).run(stale.id);
const recoveredResult = await processEmailOutbox(delivered);
assert.equal(recoveredResult.delivered, 1);
assert.deepEqual(
  db.prepare("SELECT attempt_number, status, safe_error_code FROM email_delivery_attempt WHERE outbox_job_id = ? ORDER BY attempt_number").all(stale.id),
  [
    { attempt_number: 1, status: "retry", safe_error_code: "EMAIL_WORKER_LOCK_EXPIRED" },
    { attempt_number: 2, status: "delivered", safe_error_code: null },
  ],
);

assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
assert.equal(db.pragma("foreign_key_check").length, 0);
process.stdout.write("Email delivery engine verified.\n");
