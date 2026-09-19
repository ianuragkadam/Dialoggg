import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject } from "@/lib/authorization";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { addDays, workingDayEnd } from "@/lib/dates";

function ensureMembership(projectId: number, companyId: number | null) {
  const p = db.prepare("SELECT id FROM project WHERE id = ? AND company_id = ?").get(projectId, companyId);
  return !!p;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = Number(id);
  if (!canViewProject(actor, projectId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const external = actor.companyRole === "external";

  const events = db.prepare(`SELECT id, title, start_date, end_date, color${external ? "" : ", description"} FROM event WHERE project_id = ? ${external ? "AND external_visible = 1" : ""}`).all(projectId) as any[];
  const tasks = db.prepare(`SELECT id, name, start_date, duration, color, allow_saturday, allow_sunday FROM task WHERE project_id = ? AND is_header = 0 ${external ? "AND external_visible = 1" : ""}`).all(projectId) as any[];

  // Build a FullCalendar-friendly list
  const cal = [
    ...events.map(e => ({
      id: `e${e.id}`, title: e.title,
      start: e.start_date, end: addDays(e.end_date || e.start_date, 1),
      color: e.color || "#7f8c8d",
      extendedProps: { kind: "event", ...(external ? {} : { description: e.description }) },
    })),
    ...tasks.map(t => ({
      id: `t${t.id}`, title: t.name,
      start: t.start_date,
      end: addDays(workingDayEnd(t.start_date, t.duration, { allowSaturday: !!t.allow_saturday, allowSunday: !!t.allow_sunday }), 1),
      color: t.color, classNames: ["fc-event-task"],
      extendedProps: { kind: "task" },
    })),
  ];
  return NextResponse.json({ events: cal });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireCompanyRole(["owner", "admin"]);
  if ("error" in g) return g.error;
  const actor = g.actor;
  if (await validateMutationRequest(req, actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ensureMembership(Number(id), actor.companyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  if (!body.title || !body.start_date) {
    return NextResponse.json({ error: "Event title and start_date are required" }, { status: 400 });
  }
  const r = db.prepare(
    "INSERT INTO event (project_id, title, start_date, end_date, color, description, external_visible) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(Number(id), body.title, body.start_date, body.end_date || body.start_date, body.color || null, body.description || null, body.external_visible === true ? 1 : 0);
  return NextResponse.json({ id: r.lastInsertRowid });
}
