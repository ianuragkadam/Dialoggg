import { NextResponse } from "next/server";

import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { addDays, workingDayEnd } from "@/lib/dates";

type ScheduleItem = {
  id: string;
  resourceId: number;
  title: string;
  start: string;
  end: string;
  color: string;
  projectId: number | null;
  kind: "Task" | "Event";
};

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.contextType !== "company" || !actor.companyId || actor.companyRole === "external") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resources = db.prepare("SELECT id, name FROM resource WHERE company_id = ? ORDER BY lower(name), id")
    .all(actor.companyId) as Array<{ id: number; name: string }>;
  const taskRows = db.prepare(`
    SELECT t.id, t.name, t.start_date, t.duration, t.color, t.allow_saturday, t.allow_sunday,
      tr.resource_id, p.id AS project_id, p.name AS project_name
    FROM task t
    JOIN task_resource tr ON tr.task_id = t.id
    JOIN project p ON p.id = t.project_id
    JOIN resource r ON r.id = tr.resource_id AND r.company_id = p.company_id
    WHERE p.company_id = ? AND t.is_header = 0
  `).all(actor.companyId) as Array<{ id: number; name: string; start_date: string; duration: number; color: string; allow_saturday: number; allow_sunday: number; resource_id: number; project_id: number; project_name: string }>;
  const eventRows = db.prepare(`
    SELECT es.id, es.title, es.timing_mode, es.start_date, es.end_date, es.start_at, es.end_at, es.color,
      er.resource_id, es.project_id, COALESCE(p.name, 'Company calendar') AS project_name
    FROM event_series es
    JOIN event_resource er ON er.series_id = es.id
    JOIN resource r ON r.id = er.resource_id AND r.company_id = es.company_id
    LEFT JOIN project p ON p.id = es.project_id AND p.company_id = es.company_id
    WHERE es.company_id = ?
  `).all(actor.companyId) as Array<{
    id: number; title: string; timing_mode: "all_day" | "timed"; start_date: string | null; end_date: string | null;
    start_at: string | null; end_at: string | null; color: string; resource_id: number; project_id: number | null; project_name: string;
  }>;

  const items: ScheduleItem[] = [
    ...taskRows.map(row => ({
      id: `t${row.id}-r${row.resource_id}`,
      resourceId: row.resource_id,
      title: `${row.name} (${row.project_name})`,
      start: row.start_date,
      end: addDays(workingDayEnd(row.start_date, row.duration, { allowSaturday: !!row.allow_saturday, allowSunday: !!row.allow_sunday }), 1),
      color: row.color,
      projectId: row.project_id,
      kind: "Task" as const,
    })),
    ...eventRows.flatMap(row => {
      const start = row.timing_mode === "timed" ? row.start_at : row.start_date;
      const end = row.timing_mode === "timed" ? row.end_at : row.start_date ? addDays(row.end_date || row.start_date, 1) : null;
      return start && end ? [{
        id: `e${row.id}-r${row.resource_id}`,
        resourceId: row.resource_id,
        title: `${row.title} (${row.project_name})`,
        start,
        end,
        color: row.color,
        projectId: row.project_id,
        kind: "Event" as const,
      }] : [];
    }),
  ];

  const conflicts = new Set<string>();
  const byResource = new Map<number, ScheduleItem[]>();
  for (const item of items) byResource.set(item.resourceId, [...(byResource.get(item.resourceId) ?? []), item]);
  for (const resourceItems of byResource.values()) {
    resourceItems.sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
    for (let left = 0; left < resourceItems.length; left += 1) {
      const leftEnd = Date.parse(resourceItems[left].end);
      for (let right = left + 1; right < resourceItems.length; right += 1) {
        if (leftEnd > Date.parse(resourceItems[right].start)) {
          conflicts.add(resourceItems[left].id);
          conflicts.add(resourceItems[right].id);
        } else break;
      }
    }
  }

  return NextResponse.json({
    resources: resources.map(resource => ({ id: String(resource.id), title: resource.name })),
    events: items.map(item => {
      const conflict = conflicts.has(item.id);
      return {
        id: item.id,
        resourceId: String(item.resourceId),
        title: item.title,
        start: item.start,
        end: item.end,
        color: conflict ? "#c0392b" : item.color,
        borderColor: conflict ? "#7d1f15" : undefined,
        extendedProps: { conflict, project_id: item.projectId, kind: item.kind },
      };
    }),
  }, { headers: { "cache-control": "no-store" } });
}
