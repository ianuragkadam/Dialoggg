import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import db from "@/db";

type EmailTemplate = "invitation" | "password_reset" | "operational";
type EmailKind = "invitation_email" | "password_reset_email" | "operational_notification_email";

export type TransactionalEmail = {
  to: string;
  template: EmailTemplate;
  variables: Record<string, string>;
};

type EncryptedEnvelope = {
  v: 1;
  alg: "A256GCM";
  iv: string;
  tag: string;
  ciphertext: string;
};

export type EmailDeliveryResult = { providerMessageId?: string };

export class EmailDeliveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly httpStatus: number | null = null,
  ) {
    super(code);
  }
}

export type EmailSender = ((message: TransactionalEmail, idempotencyKey: string) => Promise<EmailDeliveryResult | void>) & {
  providerConfigId?: number;
  credentialVersion?: number;
};

function encryptionKey() {
  const encoded = process.env.APP_ENCRYPTION_KEY;
  if (!encoded) throw new Error("APP_ENCRYPTION_KEY is required for transactional email.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

function encryptEnvelope(value: unknown, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const envelope: EncryptedEnvelope = {
    v: 1,
    alg: "A256GCM",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(envelope);
}

function decryptEnvelope<T>(value: string, context: string) {
  const envelope = JSON.parse(value) as EncryptedEnvelope;
  if (envelope.v !== 1 || envelope.alg !== "A256GCM") throw new Error("Unsupported email payload envelope.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

export function encryptEmailPayload(payload: TransactionalEmail) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return JSON.stringify({
    v: 1,
    alg: "A256GCM",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  } satisfies EncryptedEnvelope);
}

export function decryptEmailPayload(value: string): TransactionalEmail {
  const envelope = JSON.parse(value) as EncryptedEnvelope;
  if (envelope.v !== 1 || envelope.alg !== "A256GCM") throw new Error("Unsupported email payload envelope.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as TransactionalEmail;
}

function recipientDomain(address: string) {
  const normalized = address.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1 || !normalized.slice(at + 1).includes(".")) throw new Error("EMAIL_RECIPIENT_INVALID");
  return normalized.slice(at + 1);
}

export function queueTransactionalEmail(input: {
  companyId?: number | null;
  kind: EmailKind;
  idempotencyKey: string;
  expiresAt: string;
  email: TransactionalEmail;
}) {
  if (!Number.isFinite(Date.parse(input.expiresAt))) throw new Error("EMAIL_EXPIRY_INVALID");
  return db.prepare(`
    INSERT INTO outbox_job (
      company_id, kind, idempotency_key, payload_json, recipient_domain, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `).run(
    input.companyId ?? null,
    input.kind,
    input.idempotencyKey,
    encryptEmailPayload(input.email),
    recipientDomain(input.email.to),
    input.expiresAt,
  );
}

function deliveryCopy(message: TransactionalEmail) {
  if (message.template === "invitation") return { action: "Accept invitation", subject: "Your Dialoggg invitation" };
  if (message.template === "password_reset") return { action: "Reset password", subject: "Reset your Dialoggg password" };
  return { action: message.variables.actionLabel || "Open Dialoggg", subject: message.variables.subject || "Dialoggg notification" };
}

function providerFailure(status: number) {
  if ([408, 409, 425, 429].includes(status) || status >= 500) return new EmailDeliveryError(`RESEND_PROVIDER_${status}`, true, status);
  if ([401, 403].includes(status)) return new EmailDeliveryError("RESEND_CREDENTIAL_REJECTED", false, status);
  if (status === 422) return new EmailDeliveryError("RESEND_SENDER_REJECTED", false, status);
  return new EmailDeliveryError("RESEND_REQUEST_REJECTED", false, status);
}

function resendDeliveryConfig() {
  const row = db.prepare(`
    SELECT ic.id, ic.status, ic.disabled_at, ic.credential_version, ic.non_secret_json,
      cv.encrypted_envelope, cv.version
    FROM integration_config ic
    JOIN integration_credential_version cv ON cv.config_id = ic.id AND cv.is_active = 1
    WHERE ic.provider = 'resend_platform' AND ic.company_id IS NULL
  `).get() as {
    id: number;
    status: string;
    disabled_at: string | null;
    credential_version: number;
    non_secret_json: string;
    encrypted_envelope: string;
    version: number;
  } | undefined;
  if (!row || row.disabled_at || row.status !== "verified") throw new Error("RESEND_CONFIGURATION_UNAVAILABLE");
  const config = JSON.parse(row.non_secret_json) as Record<string, string>;
  const secrets = decryptEnvelope<Record<string, string>>(row.encrypted_envelope, `integration:${row.id}:v${row.version}`);
  return { ...row, config, secrets };
}

function markResendDeliveryFailure(configId: number, code: string) {
  if (!["RESEND_CREDENTIAL_REJECTED", "RESEND_DOMAIN_NOT_VERIFIED", "RESEND_SENDER_REJECTED"].includes(code)) return;
  db.prepare(`
    UPDATE integration_config SET status = 'action_required', safe_status_code = ?, verified_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND provider = 'resend_platform'
  `).run(code, configId);
}

export function resendEmailSender(): EmailSender {
  const saved = resendDeliveryConfig();
  const apiKey = saved.secrets.apiKey;
  const fromAddress = saved.config.fromAddress;
  const fromName = saved.config.fromName || "Dialoggg";
  if (!apiKey || !fromAddress) throw new Error("RESEND_CONFIGURATION_INCOMPLETE");
  const sender: EmailSender = async (message, idempotencyKey) => {
    const copy = deliveryCopy(message);
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          from: `${fromName} <${fromAddress}>`,
          to: [message.to],
          reply_to: saved.config.replyTo || undefined,
          subject: copy.subject,
          text: `${message.variables.greeting}\n\n${message.variables.message}\n\n${copy.action}: ${message.variables.actionUrl}\n\nThis link or notice expires at ${message.variables.expiresAt}.`,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new EmailDeliveryError("RESEND_PROVIDER_UNREACHABLE", true);
    }
    if (!response.ok) throw providerFailure(response.status);
    const result = await response.json().catch(() => null) as { id?: unknown } | null;
    return { providerMessageId: typeof result?.id === "string" ? result.id.slice(0, 500) : undefined };
  };
  sender.providerConfigId = saved.id;
  sender.credentialVersion = saved.credential_version;
  return sender;
}

function retryDelayMinutes(attempts: number) {
  return [1, 2, 4, 8, 15, 30, 60, 120][Math.min(Math.max(attempts - 1, 0), 7)];
}

function safeFailure(error: unknown) {
  if (error instanceof EmailDeliveryError) return error;
  return new EmailDeliveryError("EMAIL_DELIVERY_FAILED", true);
}

function completeAttempt(input: {
  attemptId: number;
  status: "delivered" | "retry" | "dead" | "cancelled" | "deferred";
  errorCode?: string | null;
  httpStatus?: number | null;
  providerEnvelope?: string | null;
  startedAt: number;
}) {
  db.prepare(`
    UPDATE email_delivery_attempt SET status = ?, safe_error_code = ?, http_status = ?,
      provider_message_envelope = ?, completed_at = CURRENT_TIMESTAMP, latency_ms = ?
    WHERE id = ?
  `).run(input.status, input.errorCode ?? null, input.httpStatus ?? null, input.providerEnvelope ?? null, Math.max(0, Date.now() - input.startedAt), input.attemptId);
}

export async function processEmailOutbox(providedSender?: EmailSender, limit = 25) {
  const result = { delivered: 0, failed: 0, deferred: 0, expired: 0 };
  db.transaction(() => {
    const staleRows = db.prepare(`
      SELECT id, attempts FROM outbox_job
      WHERE kind IN ('invitation_email','password_reset_email','operational_notification_email')
        AND status = 'running' AND datetime(locked_at) <= datetime('now', '-15 minutes')
    `).all() as Array<{ id: number; attempts: number }>;
    for (const row of staleRows) {
      db.prepare(`
        UPDATE email_delivery_attempt SET status = 'retry', safe_error_code = 'EMAIL_WORKER_LOCK_EXPIRED',
          completed_at = CURRENT_TIMESTAMP,
          latency_ms = MAX(0, CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER))
        WHERE outbox_job_id = ? AND attempt_number = ? AND status = 'started'
      `).run(row.id, row.attempts);
      db.prepare(`
        UPDATE outbox_job SET status = 'retry', next_attempt_at = CURRENT_TIMESTAMP, locked_at = NULL, locked_by = NULL,
          failure_kind = 'transient', last_error_code = 'EMAIL_WORKER_LOCK_EXPIRED', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'running'
      `).run(row.id);
    }
  })();

  const expiredRows = db.prepare(`
    SELECT id, attempts FROM outbox_job
    WHERE kind IN ('invitation_email','password_reset_email','operational_notification_email')
      AND status IN ('pending','retry') AND datetime(expires_at) <= CURRENT_TIMESTAMP
  `).all() as Array<{ id: number; attempts: number }>;
  for (const row of expiredRows) {
    const cancelled = db.transaction(() => {
      const changed = db.prepare(`
        UPDATE outbox_job SET status = 'cancelled', failure_kind = 'expired', last_error_code = 'EMAIL_EXPIRED',
          dead_at = CURRENT_TIMESTAMP, locked_at = NULL, locked_by = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('pending','retry')
      `).run(row.id);
      if (changed.changes !== 1) return false;
      db.prepare(`
        INSERT INTO email_delivery_attempt (outbox_job_id, attempt_number, credential_version, status, safe_error_code, completed_at, latency_ms)
        VALUES (?, ?, ?, 'cancelled', 'EMAIL_EXPIRED', CURRENT_TIMESTAMP, 0)
      `).run(row.id, row.attempts + 1, providedSender?.credentialVersion ?? null);
      return true;
    })();
    if (cancelled) result.expired += 1;
  }

  let sender = providedSender;
  if (!sender) {
    try {
      sender = resendEmailSender();
    } catch {
      const deferred = db.prepare(`
        UPDATE outbox_job SET status = 'retry', next_attempt_at = datetime('now', '+15 minutes'),
          failure_kind = 'configuration', last_error_code = 'RESEND_CONFIGURATION_UNAVAILABLE', updated_at = CURRENT_TIMESTAMP
        WHERE kind IN ('invitation_email','password_reset_email','operational_notification_email')
          AND status IN ('pending','retry') AND next_attempt_at <= CURRENT_TIMESTAMP AND datetime(expires_at) > CURRENT_TIMESTAMP
      `).run();
      result.deferred = deferred.changes;
      return result;
    }
  }

  const rows = db.prepare(`
    SELECT id, idempotency_key, payload_json, attempts, max_attempts
    FROM outbox_job
    WHERE kind IN ('invitation_email','password_reset_email','operational_notification_email')
      AND status IN ('pending','retry') AND next_attempt_at <= CURRENT_TIMESTAMP AND datetime(expires_at) > CURRENT_TIMESTAMP
    ORDER BY id LIMIT ?
  `).all(limit) as Array<{ id: number; idempotency_key: string; payload_json: string; attempts: number; max_attempts: number }>;

  for (const row of rows) {
    const startedAt = Date.now();
    const attemptNumber = row.attempts + 1;
    const attemptId = db.transaction(() => {
      const claimed = db.prepare(`
        UPDATE outbox_job SET status = 'running', locked_at = CURRENT_TIMESTAMP, locked_by = ?,
          attempts = attempts + 1, first_attempt_at = COALESCE(first_attempt_at, CURRENT_TIMESTAMP),
          last_attempt_at = CURRENT_TIMESTAMP, provider_config_id = ?, provider_credential_version = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('pending','retry')
      `).run(`email-worker:${process.pid}`, sender.providerConfigId ?? null, sender.credentialVersion ?? null, row.id);
      if (claimed.changes !== 1) return null;
      return Number(db.prepare(`
        INSERT INTO email_delivery_attempt (outbox_job_id, attempt_number, credential_version, status)
        VALUES (?, ?, ?, 'started')
      `).run(row.id, attemptNumber, sender.credentialVersion ?? null).lastInsertRowid);
    })();
    if (attemptId === null) continue;
    try {
      const delivery = await sender(decryptEmailPayload(row.payload_json), row.idempotency_key);
      const providerEnvelope = delivery && delivery.providerMessageId
        ? encryptEnvelope({ id: delivery.providerMessageId }, `dialoggg:email-receipt:${row.id}:attempt:${attemptNumber}`)
        : null;
      db.transaction(() => {
        db.prepare(`
          UPDATE outbox_job SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
            locked_at = NULL, locked_by = NULL, failure_kind = NULL, last_error_code = NULL,
            last_http_status = NULL, provider_message_envelope = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(providerEnvelope, row.id);
        completeAttempt({ attemptId, status: "delivered", providerEnvelope, startedAt });
      })();
      result.delivered += 1;
    } catch (error) {
      const failure = safeFailure(error);
      const dead = !failure.retryable || attemptNumber >= row.max_attempts;
      const status = dead ? "dead" : "retry";
      db.transaction(() => {
        db.prepare(`
          UPDATE outbox_job SET status = ?, next_attempt_at = datetime('now', ?),
            locked_at = NULL, locked_by = NULL, failure_kind = ?, last_error_code = ?, last_http_status = ?,
            dead_at = CASE WHEN ? = 'dead' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(status, `+${retryDelayMinutes(attemptNumber)} minutes`, dead ? "permanent" : "transient", failure.code, failure.httpStatus, status, row.id);
        completeAttempt({ attemptId, status, errorCode: failure.code, httpStatus: failure.httpStatus, startedAt });
      })();
      if (sender.providerConfigId && !failure.retryable) markResendDeliveryFailure(sender.providerConfigId, failure.code);
      result.failed += 1;
    }
  }
  return result;
}

export function retryEmailDelivery(jobId: number) {
  const row = db.prepare(`
    SELECT id, expires_at, CASE WHEN julianday(expires_at) > julianday('now') THEN 1 ELSE 0 END AS unexpired
    FROM outbox_job
    WHERE id = ? AND kind IN ('invitation_email','password_reset_email','operational_notification_email')
      AND status IN ('dead','retry')
  `).get(jobId) as { id: number; expires_at: string | null; unexpired: number } | undefined;
  if (!row) throw new Error("EMAIL_JOB_NOT_RETRYABLE");
  if (!row.expires_at || row.unexpired !== 1) throw new Error("EMAIL_JOB_EXPIRED");
  db.prepare(`
    UPDATE outbox_job SET status = 'retry', next_attempt_at = CURRENT_TIMESTAMP, dead_at = NULL,
      failure_kind = NULL, last_error_code = NULL, last_http_status = NULL,
      manual_retry_count = manual_retry_count + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(jobId);
}
