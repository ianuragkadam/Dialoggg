import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";
import { queueGoogleReconciliation } from "@/lib/google-calendar-queue";

function taskBelongsToCompany(projectId: number, taskId: number, companyId: number | null) {
  return !!db.prepare(`
    SELECT t.id FROM task t
    JOIN project p ON p.id = t.project_id
    WHERE t.id = ? AND t.project_id = ? AND p.company_id = ?
  `).get(taskId, projectId, companyId);
}

function taskIsWritable(projectId: number, taskId: number, companyId: number | null) {
  return !!db.prepare(`SELECT t.id FROM task t JOIN project p ON p.id=t.project_id
    WHERE t.id=? AND t.project_id=? AND p.company_id=? AND p.status='active' AND t.is_header=0`).get(taskId, projectId, companyId);
}

// Get + set which resources are assigned to a task.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.companyRole === "external") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!taskBelongsToCompany(Number(id), Number(taskId), actor.companyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const rows = db.prepare(
    "SELECT resource_id FROM task_resource WHERE task_id = ?",
  ).all(Number(taskId)) as { resource_id: number }[];
  return NextResponse.json({ resource_ids: rows.map(r => r.resource_id) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const traceId = requestId(req);
  const { id, taskId } = await params;
  const g = await requireCompanyRole(["owner", "admin"]);
  if ("error" in g) return g.error;
  const actor = g.actor;
  if (await validateMutationRequest(req, actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!taskIsWritable(Number(id), Number(taskId), actor.companyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  const rawIds = Array.isArray(body.resource_ids) ? body.resource_ids.map(Number) : [];
  if (!rawIds.every(id => Number.isInteger(id) && id > 0)) return NextResponse.json({ error: "Invalid Resource IDs" }, { status: 400 });
  const ids = [...new Set(rawIds)];
  for (const resourceId of ids) {
    const resource = db.prepare(
      "SELECT id FROM resource WHERE id = ? AND company_id = ? AND status = 'active'",
    ).get(resourceId, actor.companyId);
    if (!resource) return NextResponse.json({ error: "Active Resource not found" }, { status: 404 });
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM task_resource WHERE task_id = ?").run(Number(taskId));
    const ins = db.prepare("INSERT INTO task_resource (task_id, resource_id) VALUES (?, ?)");
    for (const rid of ids) ins.run(Number(taskId), rid);
  });
  tx();
  queueGoogleReconciliation(actor.companyId!, "task.resources.update");

  recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId: Number(id), action: "task.resources.update", targetType: "task", targetId: Number(taskId), result: "success", metadata: { resourceCount: ids.length } });

  return NextResponse.json({ ok: true }, { headers: { "x-request-id": traceId, "cache-control": "no-store" } });
}
