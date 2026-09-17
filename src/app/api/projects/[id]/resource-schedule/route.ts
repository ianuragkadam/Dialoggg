import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject } from "@/lib/authorization";

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = Number(id);
  if (!canViewProject(actor, projectId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (actor.companyRole === "external") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Resources used on this project (or all company resources if none assigned)
  const resources = db.prepare(`
    SELECT DISTINCT r.id, r.name FROM resource r
    LEFT JOIN task_resource tr ON tr.resource_id = r.id
    LEFT JOIN task t ON t.id = tr.task_id AND t.project_id = ?
    WHERE r.company_id = ?
    ORDER BY r.name
  `).all(projectId, actor.companyId) as any[];

  // Tasks with their resources
  const events = db.prepare(`
    SELECT t.id AS task_id, t.name, t.start_date, t.duration, t.color, tr.resource_id
    FROM task t
    JOIN task_resource tr ON tr.task_id = t.id
    WHERE t.project_id = ? AND t.is_header = 0
  `).all(projectId) as any[];

  return NextResponse.json({
    resources: resources.map(r => ({ id: String(r.id), title: r.name })),
    events: events.map(e => ({
      id: `t${e.task_id}-r${e.resource_id}`,
      resourceId: String(e.resource_id),
      title: e.name,
      start: e.start_date,
      end: addDays(e.start_date, e.duration),
      color: e.color,
    })),
  });
}
