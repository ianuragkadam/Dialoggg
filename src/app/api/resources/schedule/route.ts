import { NextRequest, NextResponse } from "next/server";

import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { addDays, workingDayEnd } from "@/lib/dates";
import { listEventOccurrences } from "@/lib/events-calendar";

type ScheduleItem = {
  id: string;
  resourceId: number;
  title: string;
  start: string;
  end: string;
  color: string;
  projectId: number | null;
  projectName: string;
  sourceId: string;
  rawTitle: string;
  taskId?: number;
  kind: "Task" | "Event";
  seriesId?: number;
  occurrenceKey?: string;
  version?: number;
  allDay: boolean;
  timeZone?: string;
  recurring?: boolean;
  activeForConflict: boolean;
};

export async function GET(request: NextRequest) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.contextType !== "company" || !actor.companyId || actor.companyRole === "external") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resources = db.prepare(`SELECT r.id, r.name, COALESCE(rc.name, 'Other') AS category
    FROM resource r LEFT JOIN resource_category rc ON rc.id = r.category_id AND rc.company_id = r.company_id
    WHERE r.company_id = ? ORDER BY lower(r.name), r.id`)
    .all(actor.companyId) as Array<{ id: number; name: string; category: string }>;
  const categories = db.prepare("SELECT id, name FROM resource_category WHERE company_id = ? ORDER BY lower(name), id")
    .all(actor.companyId) as Array<{ id: number; name: string }>;
  const resourceById = new Map(resources.map(resource => [resource.id, resource]));
  const includeArchived = request.nextUrl.searchParams.get("include_archived") === "true";
  const taskRows = db.prepare(`
    SELECT t.id, t.name, t.start_date, t.duration, t.color, t.allow_saturday, t.allow_sunday,
      tr.resource_id, p.id AS project_id, p.name AS project_name, p.status AS project_status
    FROM task t
    JOIN task_resource tr ON tr.task_id = t.id
    JOIN project p ON p.id = t.project_id
    JOIN resource r ON r.id = tr.resource_id AND r.company_id = p.company_id
    WHERE p.company_id = ? AND t.is_header = 0 AND (? = 1 OR p.status = 'active')
  `).all(actor.companyId, includeArchived ? 1 : 0) as Array<{ id: number; name: string; start_date: string; duration: number; color: string; allow_saturday: number; allow_sunday: number; resource_id: number; project_id: number; project_name: string; project_status: string }>;
  const now=new Date();const rangeStart=request.nextUrl.searchParams.get("start")||new Date(now.getTime()-366*86400000).toISOString();const rangeEnd=request.nextUrl.searchParams.get("end")||new Date(now.getTime()+732*86400000).toISOString();
  const eventOccurrences=listEventOccurrences(actor,{rangeStart,rangeEnd,includeArchived});
  const activeProjectIds = new Set((db.prepare("SELECT id FROM project WHERE company_id = ? AND status = 'active'").all(actor.companyId) as Array<{ id: number }>).map(project => project.id));

  const items: ScheduleItem[] = [
    ...taskRows.map(row => ({
      id: `t${row.id}-r${row.resource_id}`,
      resourceId: row.resource_id,
      title: `${row.name} (${row.project_name})`,
      start: row.start_date,
      end: addDays(workingDayEnd(row.start_date, row.duration, { allowSaturday: !!row.allow_saturday, allowSunday: !!row.allow_sunday }), 1),
      color: row.color,
      projectId: row.project_id,
      projectName: row.project_name,
      sourceId: `t${row.id}`,
      rawTitle: row.name,
      taskId: row.id,
      kind: "Task" as const,
      allDay: true,
      activeForConflict: row.project_status === "active",
    })),
    ...eventOccurrences.flatMap(occurrence => occurrence.resourceIds.map(resourceId => ({
        id: `${occurrence.id}-r${resourceId}`,
        resourceId,
        title: `${occurrence.title} (${occurrence.projectName||"Company calendar"})`,
        start: occurrence.start,
        end: occurrence.end,
        color: occurrence.color,
        projectId: occurrence.projectId,
        projectName: occurrence.projectName || "Company calendar",
        sourceId: occurrence.id,
        rawTitle: occurrence.title,
        kind: "Event" as const,
        seriesId: occurrence.seriesId,
        occurrenceKey: occurrence.occurrenceKey,
        version: occurrence.version,
        allDay: occurrence.allDay,
        timeZone: occurrence.timeZone,
        recurring: occurrence.recurring,
        activeForConflict: occurrence.projectId === null || activeProjectIds.has(occurrence.projectId),
      }))),
  ];

  const conflicts = new Set<string>();
  const byResource = new Map<number, ScheduleItem[]>();
  for (const item of items) if (item.activeForConflict) byResource.set(item.resourceId, [...(byResource.get(item.resourceId) ?? []), item]);
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
    categories,
    resources: resources.map(resource => ({ id: String(resource.id), title: resource.name, category: resource.category })),
    events: items.map(item => {
      const conflict = conflicts.has(item.id);
      return {
        id: item.id,
        resourceId: String(item.resourceId),
        title: item.title,
        start: item.start,
        end: item.end,
        color: item.color,
        borderColor: conflict ? "#7d1f15" : item.color,
        allDay: item.allDay,
        extendedProps: { conflict, resourceName: resourceById.get(item.resourceId)?.name ?? "Resource", resourceCategory: resourceById.get(item.resourceId)?.category ?? "Other", project_id: item.projectId, projectName: item.projectName, sourceId: item.sourceId, rawTitle: item.rawTitle, taskId: item.taskId, kind: item.kind, seriesId:item.seriesId, occurrenceKey:item.occurrenceKey, version:item.version, timeZone:item.timeZone, recurring:item.recurring },
      };
    }),
  }, { headers: { "cache-control": "no-store" } });
}
