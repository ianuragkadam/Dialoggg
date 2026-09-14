import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/guard";
import { cascadeFrom, reconcileHeader } from "@/lib/gantt-cascade";

function ensureMembership(projectId: number, companyId: number | null) {
  const p = db.prepare("SELECT id FROM project WHERE id = ? AND company_id = ?").get(projectId, companyId);
  return !!p;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const user = g.user;
  if (!ensureMembership(Number(id), user.company_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  const tid = Number(taskId);
  const current = db.prepare(
    "SELECT * FROM task WHERE id = ? AND project_id = ?",
  ).get(tid, Number(id)) as any;
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  db.prepare(
    `UPDATE task SET name = ?, start_date = ?, duration = ?, progress = ?, color = ?, parent_id = ?
     WHERE id = ?`,
  ).run(
    body.text ?? current.name,
    body.start_date ?? current.start_date,
    Number(body.duration ?? current.duration),
    Number(body.progress ?? current.progress ?? 0),
    body.color ?? current.color,
    body.parent && Number(body.parent) > 0 ? Number(body.parent) : null,
    tid,
  );

  cascadeFrom(tid);
  if (current.parent_id) reconcileHeader(current.parent_id);
  if (body.parent && Number(body.parent) > 0 && body.parent !== current.parent_id) {
    reconcileHeader(Number(body.parent));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const user = g.user;
  if (!ensureMembership(Number(id), user.company_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const tid = Number(taskId);
  const parent = (db.prepare("SELECT parent_id FROM task WHERE id = ?").get(tid) as any)?.parent_id;
  db.prepare("DELETE FROM task WHERE id = ?").run(tid);
  if (parent) reconcileHeader(parent);
  return NextResponse.json({ ok: true });
}
