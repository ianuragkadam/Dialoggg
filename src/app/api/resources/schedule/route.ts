import { NextResponse } from "next/server";
import db from "@/db";
import { getCurrentUser } from "@/lib/auth";

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.user_type === "external") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const resources = db.prepare(
    "SELECT id, name FROM resource WHERE company_id = ? ORDER BY name",
  ).all(user.company_id) as { id: number; name: string }[];

  // Pull every assigned non-header task across all of this company's projects
  const events = db.prepare(`
    SELECT t.id AS task_id, t.name, t.start_date, t.duration, t.color,
           tr.resource_id, p.id AS project_id, p.name AS project_name
    FROM task t
    JOIN task_resource tr ON tr.task_id = t.id
    JOIN project p ON p.id = t.project_id
    WHERE p.company_id = ? AND t.is_header = 0
  `).all(user.company_id) as any[];

  // Detect overlap: same resource on two tasks whose date ranges intersect.
  // Group by resource_id, sort by start, then flag overlapping pairs.
  const conflicts = new Set<string>();
  const byResource: Record<number, any[]> = {};
  for (const e of events) {
    (byResource[e.resource_id] ??= []).push({
      ...e,
      end: addDays(e.start_date, e.duration),
    });
  }
  for (const list of Object.values(byResource)) {
    list.sort((a, b) => a.start_date < b.start_date ? -1 : 1);
    for (let i = 0; i < list.length - 1; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].end > list[j].start_date) {
          conflicts.add(`t${list[i].task_id}-r${list[i].resource_id}`);
          conflicts.add(`t${list[j].task_id}-r${list[j].resource_id}`);
        } else break;
      }
    }
  }

  return NextResponse.json({
    resources: resources.map(r => ({ id: String(r.id), title: r.name })),
    events: events.map(e => {
      const eventId = `t${e.task_id}-r${e.resource_id}`;
      const conflict = conflicts.has(eventId);
      return {
        id: eventId,
        resourceId: String(e.resource_id),
        title: `${e.name} (${e.project_name})`,
        start: e.start_date,
        end: addDays(e.start_date, e.duration),
        color: conflict ? "#c0392b" : e.color,
        borderColor: conflict ? "#7d1f15" : undefined,
        extendedProps: { conflict, project_id: e.project_id },
      };
    }),
  });
}
