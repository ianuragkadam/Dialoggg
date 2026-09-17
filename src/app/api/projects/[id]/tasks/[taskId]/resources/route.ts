import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";

function taskBelongsToCompany(projectId: number, taskId: number, companyId: number | null) {
  return !!db.prepare(`
    SELECT t.id FROM task t
    JOIN project p ON p.id = t.project_id
    WHERE t.id = ? AND t.project_id = ? AND p.company_id = ?
  `).get(taskId, projectId, companyId);
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
  const { id, taskId } = await params;
  const g = await requireCompanyRole(["owner", "admin"]);
  if ("error" in g) return g.error;
  const actor = g.actor;
  if (await validateMutationRequest(req, actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!taskBelongsToCompany(Number(id), Number(taskId), actor.companyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  const ids: number[] = Array.isArray(body.resource_ids) ? body.resource_ids.map(Number) : [];
  for (const resourceId of ids) {
    const resource = db.prepare(
      "SELECT id FROM resource WHERE id = ? AND company_id = ?",
    ).get(resourceId, actor.companyId);
    if (!resource) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM task_resource WHERE task_id = ?").run(Number(taskId));
    const ins = db.prepare("INSERT INTO task_resource (task_id, resource_id) VALUES (?, ?)");
    for (const rid of ids) ins.run(Number(taskId), rid);
  });
  tx();

  return NextResponse.json({ ok: true });
}
