import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/guard";

function ensureMembership(projectId: number, companyId: number | null) {
  const p = db.prepare("SELECT id FROM project WHERE id = ? AND company_id = ?").get(projectId, companyId);
  return !!p;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !ensureMembership(Number(id), user.company_id)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = db.prepare("SELECT * FROM event WHERE project_id = ?").all(Number(id)) as any[];
  const tasks = db.prepare("SELECT * FROM task WHERE project_id = ? AND is_header = 0").all(Number(id)) as any[];

  // Build a FullCalendar-friendly list
  const cal = [
    ...events.map(e => ({
      id: `e${e.id}`, title: e.title,
      start: e.start_date, end: addDays(e.end_date || e.start_date, 1),
      color: e.color || "#7f8c8d",
      extendedProps: { kind: "event", description: e.description },
    })),
    ...tasks.map(t => ({
      id: `t${t.id}`, title: t.name,
      start: t.start_date, end: addDays(t.start_date, t.duration),
      color: t.color, classNames: ["fc-event-task"],
      extendedProps: { kind: "task" },
    })),
  ];
  return NextResponse.json({ events: cal });
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
  if (!body.title || !body.start_date) {
    return NextResponse.json({ error: "Event title and start_date are required" }, { status: 400 });
  }
  const r = db.prepare(
    "INSERT INTO event (project_id, title, start_date, end_date, color, description) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(Number(id), body.title, body.start_date, body.end_date || body.start_date, body.color || null, body.description || null);
  return NextResponse.json({ id: r.lastInsertRowid });
}
