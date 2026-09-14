import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/guard";
import { cascadeFrom, reconcileHeader } from "@/lib/gantt-cascade";

const LINK_TYPE_MAP_OUT: Record<string, string> = { fs: "0", ss: "1", ff: "2", sf: "3" };
const LINK_TYPE_MAP_IN: Record<string, string> = { "0": "fs", "1": "ss", "2": "ff", "3": "sf" };

function ensureMembership(projectId: number, companyId: number | null) {
  const p = db.prepare("SELECT id FROM project WHERE id = ? AND company_id = ?").get(projectId, companyId);
  return !!p;
}

// dhtmlx-gantt expects: { data: Task[], links: Link[] }
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !ensureMembership(Number(id), user.company_id)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tasks = db.prepare(
    "SELECT * FROM task WHERE project_id = ? ORDER BY sort_order, id",
  ).all(Number(id)) as any[];
  const links = db.prepare(
    "SELECT * FROM task_link WHERE project_id = ?",
  ).all(Number(id)) as any[];

  const data = tasks.map(t => ({
    id: t.id,
    text: t.name,
    start_date: t.start_date,
    duration: t.duration,
    progress: t.progress ?? 0,
    parent: t.parent_id || 0,
    color: t.color,
    type: t.is_header ? "project" : "task",
    open: true,
  }));
  const linkData = links.map(l => ({
    id: l.id,
    source: l.source_task_id,
    target: l.target_task_id,
    type: LINK_TYPE_MAP_OUT[l.link_type] ?? "0",
    lag: l.lag_days,
  }));

  return NextResponse.json({ data, links: linkData });
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
  if (!body.text || !body.start_date) {
    return NextResponse.json({ error: "Task name and start_date are required" }, { status: 400 });
  }
  const duration = Number(body.duration ?? 1);
  if (!Number.isFinite(duration) || duration <= 0) {
    return NextResponse.json({ error: "Duration must be greater than zero" }, { status: 400 });
  }
  const isHeader = body.type === "project" ? 1 : 0;
  const parent = body.parent && Number(body.parent) > 0 ? Number(body.parent) : null;
  const sortRow = db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS s FROM task WHERE project_id = ?").get(Number(id)) as { s: number };
  const r = db.prepare(
    `INSERT INTO task (project_id, parent_id, name, start_date, duration, progress, color, is_header, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    Number(id), parent, body.text,
    body.start_date, duration, Number(body.progress) || 0,
    body.color || "#5599dd", isHeader, sortRow.s,
  );
  const newId = r.lastInsertRowid as number;
  if (parent) reconcileHeader(parent);
  return NextResponse.json({ id: newId, tid: newId });
}
