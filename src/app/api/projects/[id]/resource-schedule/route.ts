import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject } from "@/lib/authorization";
import { addDays, workingDayEnd } from "@/lib/dates";
import { listEventOccurrences } from "@/lib/events-calendar";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    SELECT t.id AS task_id, t.name, t.start_date, t.duration, t.color,
      t.allow_saturday, t.allow_sunday, tr.resource_id
    FROM task t
    JOIN task_resource tr ON tr.task_id = t.id
    WHERE t.project_id = ? AND t.is_header = 0
  `).all(projectId) as any[];

  const now=new Date();const eventOccurrences=listEventOccurrences(actor,{rangeStart:request.nextUrl.searchParams.get("start")||new Date(now.getTime()-366*86400000).toISOString(),rangeEnd:request.nextUrl.searchParams.get("end")||new Date(now.getTime()+732*86400000).toISOString(),projectId,includeCompleted:true}).filter(item=>item.pushToProject);
  return NextResponse.json({
    resources: resources.map(r => ({ id: String(r.id), title: r.name })),
    events: [...events.map(e => ({
      id: `t${e.task_id}-r${e.resource_id}`,
      resourceId: String(e.resource_id),
      title: e.name,
      start: e.start_date,
      end: addDays(workingDayEnd(e.start_date, e.duration, { allowSaturday: !!e.allow_saturday, allowSunday: !!e.allow_sunday }), 1),
      color: e.color,
      extendedProps:{kind:"Task"},
    })),...eventOccurrences.flatMap(item=>item.resourceIds.map(resourceId=>({id:`${item.id}-r${resourceId}`,resourceId:String(resourceId),title:item.title,start:item.start,end:item.end,color:item.color,extendedProps:{kind:"Event",seriesId:item.seriesId,occurrenceKey:item.occurrenceKey,version:item.version}})))],
  },{headers:{"cache-control":"no-store"}});
}
