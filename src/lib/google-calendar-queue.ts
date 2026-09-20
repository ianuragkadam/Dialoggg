import "server-only";

import { randomUUID } from "node:crypto";

import db from "@/db";

export function queueGoogleConnection(connectionId: number, reason: string) {
  const connection = db.prepare("SELECT id, company_id, state FROM google_connection WHERE id = ?").get(connectionId) as { id: number; company_id: number; state: string } | undefined;
  if (!connection || !["healthy", "connecting"].includes(connection.state)) return false;
  db.prepare(`
    INSERT INTO outbox_job (company_id, kind, idempotency_key, payload_json)
    VALUES (?, 'google_calendar_reconcile', ?, ?)
  `).run(connection.company_id, `google:${connectionId}:${randomUUID()}`, JSON.stringify({ connectionId, reason: String(reason).slice(0, 80) }));
  return true;
}

export function queueGoogleReconciliation(companyId: number, reason: string) {
  const rows = db.prepare("SELECT id FROM google_connection WHERE company_id = ? AND state = 'healthy'").all(companyId) as Array<{ id: number }>;
  for (const row of rows) queueGoogleConnection(row.id, reason);
  return rows.length;
}
