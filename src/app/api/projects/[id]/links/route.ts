import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/guard";
import { cascadeFrom, wouldCreateCycle } from "@/lib/gantt-cascade";

const LINK_TYPE_IN: Record<string, string> = { "0": "fs", "1": "ss", "2": "ff", "3": "sf" };

function ensureMembership(projectId: number, companyId: number | null) {
  const p = db.prepare("SELECT id FROM project WHERE id = ? AND company_id = ?").get(projectId, companyId);
  return !!p;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const user = g.user;
  if (!ensureMembership(Number(id), user.company_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  const source = Number(body.source);
  const target = Number(body.target);
  if (!source || !target || source === target) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }
  const linkedTasks = db.prepare(
    "SELECT COUNT(*) AS count FROM task WHERE project_id = ? AND id IN (?, ?)",
  ).get(Number(id), source, target) as { count: number };
  if (linkedTasks.count !== 2) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (wouldCreateCycle(source, target)) {
    return NextResponse.json({ error: "Cycle" }, { status: 400 });
  }
  const linkType = LINK_TYPE_IN[String(body.type ?? "0")] ?? "fs";
  const r = db.prepare(
    "INSERT INTO task_link (project_id, source_task_id, target_task_id, link_type, lag_days) VALUES (?, ?, ?, ?, ?)",
  ).run(Number(id), source, target, linkType, Number(body.lag ?? 0));
  cascadeFrom(source);
  return NextResponse.json({ id: r.lastInsertRowid, tid: r.lastInsertRowid });
}
