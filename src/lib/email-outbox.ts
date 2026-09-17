import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import db from "@/db";

type EmailTemplate = "invitation" | "password_reset";

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

function encryptionKey() {
  const encoded = process.env.APP_ENCRYPTION_KEY;
  if (!encoded) throw new Error("APP_ENCRYPTION_KEY is required for transactional email.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptEmailPayload(payload: TransactionalEmail) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const envelope: EncryptedEnvelope = {
    v: 1,
    alg: "A256GCM",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(envelope);
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

export function queueTransactionalEmail(input: {
  companyId?: number | null;
  kind: "invitation_email" | "password_reset_email";
  idempotencyKey: string;
  email: TransactionalEmail;
}) {
  return db.prepare(`
    INSERT INTO outbox_job (company_id, kind, idempotency_key, payload_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `).run(
    input.companyId ?? null,
    input.kind,
    input.idempotencyKey,
    encryptEmailPayload(input.email),
  );
}

export type EmailSender = (message: TransactionalEmail, idempotencyKey: string) => Promise<void>;

export function resendEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("RESEND_API_KEY and EMAIL_FROM are required to deliver email.");
  return async (message, idempotencyKey) => {
    const action = message.template === "invitation" ? "Accept invitation" : "Reset password";
    const subject = message.template === "invitation" ? "Your Dialoggg invitation" : "Reset your Dialoggg password";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject,
        text: `${message.variables.greeting}\n\n${message.variables.message}\n\n${action}: ${message.variables.actionUrl}\n\nThis link expires at ${message.variables.expiresAt}.`,
      }),
    });
    if (!response.ok) throw new Error(`EMAIL_PROVIDER_${response.status}`);
  };
}

export async function processEmailOutbox(sender: EmailSender, limit = 25) {
  const rows = db.prepare(`
    SELECT id, idempotency_key, payload_json
    FROM outbox_job
    WHERE kind IN ('invitation_email', 'password_reset_email')
      AND status IN ('pending', 'retry') AND next_attempt_at <= CURRENT_TIMESTAMP
    ORDER BY id LIMIT ?
  `).all(limit) as Array<{ id: number; idempotency_key: string; payload_json: string }>;
  const result = { delivered: 0, failed: 0 };
  for (const row of rows) {
    const claimed = db.prepare(`
      UPDATE outbox_job SET status = 'running', locked_at = CURRENT_TIMESTAMP,
        locked_by = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('pending', 'retry')
    `).run(`worker:${process.pid}`, row.id);
    if (claimed.changes !== 1) continue;
    try {
      await sender(decryptEmailPayload(row.payload_json), row.idempotency_key);
      db.prepare(`
        UPDATE outbox_job SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
          locked_at = NULL, locked_by = NULL, last_error_code = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(row.id);
      result.delivered += 1;
    } catch (error) {
      const attempt = db.prepare("SELECT attempts FROM outbox_job WHERE id = ?").get(row.id) as { attempts: number };
      const status = attempt.attempts >= 5 ? "dead" : "retry";
      const delayMinutes = Math.min(60, 2 ** Math.max(0, attempt.attempts - 1));
      const errorCode = error instanceof Error && /^EMAIL_PROVIDER_\d+$/.test(error.message)
        ? error.message
        : "EMAIL_DELIVERY_FAILED";
      db.prepare(`
        UPDATE outbox_job SET status = ?, next_attempt_at = datetime('now', ?),
          locked_at = NULL, locked_by = NULL, last_error_code = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, `+${delayMinutes} minutes`, errorCode, row.id);
      result.failed += 1;
    }
  }
  return result;
}
