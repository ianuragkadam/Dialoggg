import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { cascadeFrom, reconcileHeader } from "@/lib/gantt-cascade";

function ensureMembership(projectId: number, companyId: number | null) {
  const p = db.prepare("SELECT id FROM project WHERE id = ? AND company_id = ?").get(projectId, companyId);
  return !!p;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const g = await requireCompanyRole(["owner", "admin"]);
  if ("error" in g) return g.error;
  const actor = g.actor;
  if (await validateMutationRequest(req, actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ensureMembership(Number(id), actor.companyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  const tid = Number(taskId);
  const current = db.prepare(
    "SELECT * FROM task WHERE id = ? AND project_id = ?",
  ).get(tid, Number(id)) as any;
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  db.prepare(
    `UPDATE task SET name = ?, start_date = ?, duration = ?, progress = ?, color = ?, parent_id = ?, external_visible = ?
     WHERE id = ?`,
  ).run(
    body.text ?? current.name,
    body.start_date ?? current.start_date,
    Number(body.duration ?? current.duration),
    Number(body.progress ?? current.progress ?? 0),
    body.color ?? current.color,
    body.parent && Number(body.parent) > 0 ? Number(body.parent) : null,
    body.external_visible === undefined ? current.external_visible : body.external_visible === true ? 1 : 0,
    tid,
  );

  cascadeFrom(tid);
  if (current.parent_id) reconcileHeader(current.parent_id);
  if (body.parent && Number(body.parent) > 0 && body.parent !== current.parent_id) {
    reconcileHeader(Number(body.parent));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const g = await requireCompanyRole(["owner", "admin"]);
  if ("error" in g) return g.error;
  const actor = g.actor;
  if (await validateMutationRequest(request, actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ensureMembership(Number(id), actor.companyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const tid = Number(taskId);
  const parent = (db.prepare("SELECT parent_id FROM task WHERE id = ?").get(tid) as any)?.parent_id;
  db.prepare("DELETE FROM task WHERE id = ?").run(tid);
  if (parent) reconcileHeader(parent);
  return NextResponse.json({ ok: true });
}
