import db from "@/db";
import { randomBytes } from "node:crypto";
import { addDays, workingDayEnd } from "@/lib/dates";
import { expandEventSeries } from "@/lib/events-calendar";

// Return (creating if needed) the iCal token for a company's master feed.
export function getCompanyToken(companyId: number): string {
  const row = db.prepare("SELECT ical_token FROM company WHERE id = ?").get(companyId) as { ical_token: string | null } | undefined;
  if (row?.ical_token) return row.ical_token;
  const token = "cmp_" + randomBytes(18).toString("hex");
  db.prepare("UPDATE company SET ical_token = ? WHERE id = ?").run(token, companyId);
  return token;
}

export function resetCompanyToken(companyId: number): string {
  const token = "cmp_" + randomBytes(18).toString("hex");
  db.prepare("UPDATE company SET ical_token = ? WHERE id = ?").run(token, companyId);
  return token;
}

// Return (creating if needed) the iCal token for one project's feed.
export function getProjectToken(projectId: number): string {
  const row = db.prepare("SELECT ical_token FROM project WHERE id = ?").get(projectId) as { ical_token: string | null } | undefined;
  if (row?.ical_token) return row.ical_token;
  const token = "prj_" + randomBytes(18).toString("hex");
  db.prepare("UPDATE project SET ical_token = ? WHERE id = ?").run(token, projectId);
  return token;
}

export function resetProjectToken(projectId: number): string {
  const token = "prj_" + randomBytes(18).toString("hex");
  db.prepare("UPDATE project SET ical_token = ? WHERE id = ?").run(token, projectId);
  return token;
}

// Return (creating if needed) the iCal token for one resource's personal feed.
export function getResourceToken(resourceId: number): string {
  const row = db.prepare("SELECT ical_token FROM resource WHERE id = ?").get(resourceId) as { ical_token: string | null } | undefined;
  if (row?.ical_token) return row.ical_token;
  const token = "res_" + randomBytes(18).toString("hex");
  db.prepare("UPDATE resource SET ical_token = ? WHERE id = ?").run(token, resourceId);
  return token;
}

type FeedItem = {
  uid: string; title: string; start: string; end: string; // end is exclusive (DTEND)
  description?: string;
  allDay?: boolean;
};

function fold(line: string): string {
  // iCal lines should be <=75 octets; fold long ones.
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let s = line;
  parts.push(s.slice(0, 73));
  s = s.slice(73);
  while (s.length > 72) { parts.push(" " + s.slice(0, 72)); s = s.slice(72); }
  if (s.length) parts.push(" " + s);
  return parts.join("\r\n");
}

function esc(t: string): string {
  return (t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n?|\n/g, "\\n");
}

function ymd(iso: string): string {
  return iso.replace(/-/g, "");
}
function utc(iso:string){return new Date(iso).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}

export function buildICS(calName: string, items: FeedItem[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dialoggg//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold("X-WR-CALNAME:" + esc(calName)),
  ];
  for (const it of items) {
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + it.uid + "@dialoggg");
    lines.push("DTSTAMP:" + now);
    if(it.allDay===false){lines.push("DTSTART:"+utc(it.start));lines.push("DTEND:"+utc(it.end));}
    else{lines.push("DTSTART;VALUE=DATE:" + ymd(it.start));lines.push("DTEND;VALUE=DATE:" + ymd(it.end));}
    lines.push(fold("SUMMARY:" + esc(it.title)));
    if (it.description) lines.push(fold("DESCRIPTION:" + esc(it.description)));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// Build feed items for a single project (its tasks + events).
export function projectFeedItems(projectId: number): FeedItem[] {
  const tasks = db.prepare(
    "SELECT * FROM task WHERE project_id = ? AND is_header = 0",
  ).all(projectId) as any[];
  const events = db.prepare("SELECT * FROM event_series WHERE project_id = ? AND status='active' AND push_to_project=1").all(projectId) as any[];
  const rangeStart=new Date(Date.now()-366*86400000).toISOString(),rangeEnd=new Date(Date.now()+732*86400000).toISOString();
  return [
    ...tasks.map(t => ({
      uid: `task-${t.id}`, title: t.name,
      start: t.start_date,
      end: addDays(workingDayEnd(t.start_date, t.duration, { allowSaturday: !!t.allow_saturday, allowSunday: !!t.allow_sunday }), 1),
      description: "Dialoggg task",
    })),
    ...events.flatMap(e => expandEventSeries(e,rangeStart,rangeEnd).map(item=>({uid:`event-${item.seriesId}-${item.occurrenceKey}`,title:item.title,start:item.start,end:item.end,allDay:item.allDay,description:item.description||"Dialoggg event"}))),
  ];
}

// Build feed items for ONE resource: only the tasks they're assigned to, across all projects.
export function resourceFeedItems(resourceId: number): FeedItem[] {
  const tasks = db.prepare(`
    SELECT t.*, p.name AS project_name FROM task t
    JOIN task_resource tr ON tr.task_id = t.id
    JOIN project p ON p.id = t.project_id
    WHERE tr.resource_id = ? AND t.is_header = 0
  `).all(resourceId) as any[];
  const resource=db.prepare("SELECT company_id FROM resource WHERE id=?").get(resourceId) as {company_id:number}|undefined;const rangeStart=new Date(Date.now()-366*86400000).toISOString(),rangeEnd=new Date(Date.now()+732*86400000).toISOString();const series=resource?db.prepare("SELECT es.* FROM event_series es JOIN event_resource er ON er.series_id=es.id WHERE er.resource_id=? AND es.company_id=? AND es.status='active'").all(resourceId,resource.company_id) as any[]:[];
  return [...tasks.map(t => ({
    uid: `task-${t.id}-r${resourceId}`,
    title: `${t.name} (${t.project_name})`,
    start: t.start_date,
    end: addDays(workingDayEnd(t.start_date, t.duration, { allowSaturday: !!t.allow_saturday, allowSunday: !!t.allow_sunday }), 1),
    description: t.project_name,
  })),...series.flatMap(e=>expandEventSeries(e,rangeStart,rangeEnd).map(item=>({uid:`event-${item.seriesId}-${item.occurrenceKey}-r${resourceId}`,title:item.projectName?`${item.title} (${item.projectName})`:item.title,start:item.start,end:item.end,allDay:item.allDay,description:item.description||item.projectName||"Dialoggg event"})))];
}

// Build feed items for every project in a company (the master feed).
export function companyFeedItems(companyId: number): FeedItem[] {
  const projects = db.prepare("SELECT id, name FROM project WHERE company_id = ?").all(companyId) as any[];
  const items: FeedItem[] = [];
  for (const p of projects) {
    const tasks = db.prepare("SELECT * FROM task WHERE project_id = ? AND is_header = 0").all(p.id) as any[];
    for (const t of tasks) items.push({
      uid: `task-${t.id}`, title: `${t.name} (${p.name})`,
      start: t.start_date,
      end: addDays(workingDayEnd(t.start_date, t.duration, { allowSaturday: !!t.allow_saturday, allowSunday: !!t.allow_sunday }), 1), description: p.name,
    });
  }
  const rangeStart=new Date(Date.now()-366*86400000).toISOString(),rangeEnd=new Date(Date.now()+732*86400000).toISOString();const events=db.prepare("SELECT * FROM event_series WHERE company_id=? AND status='active'").all(companyId) as any[];for(const event of events)for(const occurrence of expandEventSeries(event,rangeStart,rangeEnd))items.push({uid:`event-${occurrence.seriesId}-${occurrence.occurrenceKey}`,title:occurrence.projectName?`${occurrence.title} (${occurrence.projectName})`:occurrence.title,start:occurrence.start,end:occurrence.end,allDay:occurrence.allDay,description:occurrence.description||occurrence.projectName||"Dialoggg event"});
  return items;
}
