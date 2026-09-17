import db from "@/db";
import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

export function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function requestId(request?: NextRequest) {
  const supplied = request?.headers.get("x-request-id")?.trim();
  return supplied && /^[a-zA-Z0-9._:-]{8,128}$/.test(supplied) ? supplied : `req_${randomUUID()}`;
}

export function clientAddressHash(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return sha256(address);
}

export type AuditInput = {
  requestId?: string | null;
  actorIdentityId?: number | null;
  actorMembershipId?: number | null;
  companyId?: number | null;
  projectId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  result: "success" | "denied" | "failure";
  metadata?: Record<string, string | number | boolean | null>;
};

export function recordAudit(input: AuditInput) {
  db.prepare(`
    INSERT INTO audit_event (
      request_id, actor_identity_id, actor_membership_id, company_id, project_id,
      action, target_type, target_id, result, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.requestId ?? null,
    input.actorIdentityId ?? null,
    input.actorMembershipId ?? null,
    input.companyId ?? null,
    input.projectId ?? null,
    input.action,
    input.targetType ?? null,
    input.targetId === undefined || input.targetId === null ? null : String(input.targetId),
    input.result,
    JSON.stringify(input.metadata ?? {}),
  );
}

type RateLimitOptions = {
  action: string;
  discriminator: string;
  maximumAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
};

export function rateLimitStatus(options: RateLimitOptions) {
  const keyHash = sha256(`${options.action}:${options.discriminator}`);
  const row = db.prepare(`
    SELECT attempts, window_started_at, blocked_until
    FROM auth_rate_limit WHERE key_hash = ?
  `).get(keyHash) as { attempts: number; window_started_at: string; blocked_until: string | null } | undefined;
  const now = Date.now();
  if (!row) return { allowed: true, keyHash, retryAfterSeconds: 0 };
  const blockedUntil = row.blocked_until ? Date.parse(row.blocked_until) : 0;
  if (blockedUntil > now) {
    return { allowed: false, keyHash, retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - now) / 1000)) };
  }
  const windowStarted = Date.parse(row.window_started_at);
  if (!Number.isFinite(windowStarted) || now - windowStarted >= options.windowSeconds * 1000) {
    db.prepare("DELETE FROM auth_rate_limit WHERE key_hash = ?").run(keyHash);
    return { allowed: true, keyHash, retryAfterSeconds: 0 };
  }
  return { allowed: row.attempts < options.maximumAttempts, keyHash, retryAfterSeconds: 0 };
}

export function recordRateLimitFailure(options: RateLimitOptions, keyHash: string) {
  const now = new Date();
  const windowStartedAt = now.toISOString();
  const current = db.prepare("SELECT attempts, window_started_at FROM auth_rate_limit WHERE key_hash = ?").get(keyHash) as {
    attempts: number;
    window_started_at: string;
  } | undefined;
  const existingStarted = current ? Date.parse(current.window_started_at) : 0;
  const expired = !current || !Number.isFinite(existingStarted) || now.getTime() - existingStarted >= options.windowSeconds * 1000;
  const attempts = expired ? 1 : current.attempts + 1;
  const blockedUntil = attempts >= options.maximumAttempts
    ? new Date(now.getTime() + options.blockSeconds * 1000).toISOString()
    : null;
  db.prepare(`
    INSERT INTO auth_rate_limit (key_hash, action, attempts, window_started_at, blocked_until, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(key_hash) DO UPDATE SET
      action = excluded.action,
      attempts = excluded.attempts,
      window_started_at = excluded.window_started_at,
      blocked_until = excluded.blocked_until,
      updated_at = excluded.updated_at
  `).run(keyHash, options.action, attempts, expired ? windowStartedAt : current.window_started_at, blockedUntil, windowStartedAt);
}

export function clearRateLimit(keyHash: string) {
  db.prepare("DELETE FROM auth_rate_limit WHERE key_hash = ?").run(keyHash);
}
