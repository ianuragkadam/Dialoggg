"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import CalendarWorkflowReview from "@/components/CalendarWorkflowReview";
import EventOccurrenceDialog from "@/components/EventOccurrenceDialog";
import TaskOccurrenceDialog from "@/components/TaskOccurrenceDialog";
import { ProjectResourceContext } from "@/components/ProjectResourceContext";

type Resource = { id: string; title: string; category: string };
type ScheduleEvent = {
  id: string; resourceId: string; title: string; start: string; end: string; color: string; allDay: boolean;
  extendedProps: { conflict: boolean; project_id: number | null; projectName: string; resourceName: string; resourceCategory: string; rawTitle: string; taskId?: number; kind: "task" | "event"; seriesId?: number; occurrenceKey?: string; version?: number; timeZone?: string; recurring?: boolean };
};
type Project = { id: number; name: string; project_type_id?: number; project_type?: string };
type ResourceCategory = { id: number; name: string };
type CalendarView = "timeline" | "calendar";

const STANDARD_CATEGORY_ORDER = ["Employee", "Subcontractor", "Supplier", "Equipment", "Other"];

function dateKeyInZone(value: string | Date, timeZone: string) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function calendarDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", day: "numeric" }).formatToParts(value);
  return {
    weekday: parts.find(part => part.type === "weekday")?.value ?? "",
    day: parts.find(part => part.type === "day")?.value ?? "",
    dateKey: dateKeyInZone(value, timeZone),
  };
}

function resourceCalendarDateClasses(value: Date, timeZone: string) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(value);
  const classes: string[] = [];
  if (weekday === "Sat" || weekday === "Sun") classes.push("resource-calendar-weekend");
  if (dateKeyInZone(value, timeZone) === dateKeyInZone(new Date(), timeZone)) classes.push("resource-calendar-today");
  return classes;
}

function addDaysToKey(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function eventLastDate(event: ScheduleEvent, timeZone: string) {
  const end = event.end;
  if (event.allDay || /^\d{4}-\d{2}-\d{2}$/.test(end)) return addDaysToKey(dateKeyInZone(end, timeZone), -1);
  return dateKeyInZone(new Date(Date.parse(end) - 1), timeZone);
}

function eventTouchesDay(event: ScheduleEvent, day: string, timeZone: string) {
  return dateKeyInZone(event.start, timeZone) <= day && eventLastDate(event, timeZone) >= day;
}

function tooltip(event: ScheduleEvent, timeZone: string) {
  const date = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value));
  const start = date(event.start);
  const end = date(eventLastDate(event, timeZone));
  const schedule = event.allDay ? `${start}${start !== end ? ` – ${end}` : ""} (all day)` : `${date(event.start)} ${new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(event.start))} – ${new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(event.end))}`;
  return `${event.extendedProps.resourceName} · ${event.extendedProps.rawTitle} (${event.extendedProps.projectName})\n${schedule}`;
}

function toOccurrenceDialogEvent(event: ScheduleEvent) {
  return {
    ...event,
    start: new Date(event.start),
    end: new Date(event.end),
    startStr: event.start,
    endStr: event.end,
  };
}

export default function GlobalResourceSchedulePage() {
  const projectContext = useContext(ProjectResourceContext);
  const projectId = projectContext?.projectId;
  const projectName = projectContext?.projectName;
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [companyTimeZone, setCompanyTimeZone] = useState("UTC");
  const [calendarView, setCalendarView] = useState<CalendarView>("timeline");
  const [calendarSubView, setCalendarSubView] = useState("dayGridMonth");
  const [calendarDate, setCalendarDate] = useState<string | undefined>();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [preferencesKey, setPreferencesKey] = useState("");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [selectedTask, setSelectedTask] = useState<ScheduleEvent | null>(null);

  const loadSchedule = useCallback(async () => {
    const [scheduleResponse, resourceResponse, projectResponse] = await Promise.all([
      fetch(projectId ? "/api/resources/schedule?include_completed=true" : "/api/resources/schedule", { cache: "no-store" }),
      fetch("/api/resources", { cache: "no-store" }),
      fetch("/api/projects", { cache: "no-store" }),
    ]);
    const [schedule, resourceData, projectData] = await Promise.all([scheduleResponse.json(), resourceResponse.json(), projectResponse.json()]);
    if (!scheduleResponse.ok) throw new Error(schedule.error || "The Resource Calendar could not be loaded.");
    const projectEvents = projectId ? (schedule.events || []).filter((event: ScheduleEvent) => Number(event.extendedProps?.project_id) === projectId) : (schedule.events || []);
    const projectResourceIds = new Set(projectEvents.map((event: ScheduleEvent) => String(event.resourceId)));
    const nextResources = ((schedule.resources || []) as Resource[]).filter(resource => !projectId || projectResourceIds.has(String(resource.id)));
    const nextCategories = ((schedule.categories || resourceData.categories || []) as ResourceCategory[]).map(item => item.name);
    setResources(nextResources);
    setCategories((schedule.categories || resourceData.categories || []) as ResourceCategory[]);
    setEvents(projectEvents.map((event: any) => ({ ...event, extendedProps: { ...event.extendedProps, kind: String(event.extendedProps?.kind || "").toLowerCase() } })) as ScheduleEvent[]);
    setProjects(((projectData.projects || []) as Project[]).filter(item => !projectId || item.id === projectId));
    if (!preferencesReady) {
      const userResponse = await fetch("/api/me", { cache: "no-store" });
      const userData = await userResponse.json();
      const user = userData.user || {};
      setCanManage(["owner", "admin"].includes(user.user_type));
      setCompanyTimeZone(user.company_time_zone || "UTC");
      const key = `dialoggg:${projectId ? `project-${projectId}-resource-calendar` : "resource-calendar"}:${user.membership_id ?? user.identity_id ?? "user"}`;
      setPreferencesKey(key);
      const savedView = localStorage.getItem(`${key}:view`);
      if (savedView === "calendar" || savedView === "timeline") setCalendarView(savedView);
      const savedCategories = localStorage.getItem(`${key}:categories`);
      if (savedCategories) {
        try {
          const parsed = JSON.parse(savedCategories);
          if (Array.isArray(parsed)) setSelectedCategories(nextCategories.filter(category => parsed.includes(category)));
          else if (parsed && Array.isArray(parsed.selected) && Array.isArray(parsed.known)) {
            setSelectedCategories(nextCategories.filter(category => parsed.selected.includes(category) || !parsed.known.includes(category)));
          } else setSelectedCategories(nextCategories);
        } catch {
          setSelectedCategories(nextCategories);
        }
      } else setSelectedCategories(nextCategories);
      setPreferencesReady(true);
    } else {
      setSelectedCategories(current => current.filter(category => nextCategories.includes(category)));
    }
    setLoaded(true);
    setLoadError("");
  }, [preferencesReady, projectId]);

  useEffect(() => { void loadSchedule().catch(error => { setLoadError(error instanceof Error ? error.message : "The Resource Calendar could not be loaded."); setLoaded(true); }); }, [loadSchedule]);
  useEffect(() => {
    const update = () => setIsMobile(window.matchMedia("(max-width: 640px)").matches);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(() => { if (preferencesReady && preferencesKey) localStorage.setItem(`${preferencesKey}:view`, calendarView); }, [calendarView, preferencesKey, preferencesReady]);
  useEffect(() => { if (preferencesReady && preferencesKey) localStorage.setItem(`${preferencesKey}:categories`, JSON.stringify({ selected: selectedCategories, known: categories.map(category => category.name) })); }, [selectedCategories, categories, preferencesKey, preferencesReady]);

  const selectedCategorySet = useMemo(() => new Set(selectedCategories), [selectedCategories]);
  const filteredResources = useMemo(() => resources.filter(resource => selectedCategorySet.has(resource.category)), [resources, selectedCategorySet]);
  const filteredEvents = useMemo(() => events.filter(event => selectedCategorySet.has(event.extendedProps.resourceCategory)), [events, selectedCategorySet]);
  const orderedCategories = useMemo(() => {
    const existing = new Set(categories.map(category => category.name));
    return [...STANDARD_CATEGORY_ORDER.filter(name => existing.has(name)), ...[...existing].filter(name => !STANDARD_CATEGORY_ORDER.includes(name)).sort((a, b) => a.localeCompare(b))];
  }, [categories]);
  const groupedResources = useMemo(() => orderedCategories
    .filter(category => selectedCategorySet.has(category))
    .map(category => ({ id: `category:${category}`, title: category, children: filteredResources.filter(resource => resource.category === category).sort((a, b) => a.title.localeCompare(b.title)) }))
    .filter(group => group.children.length), [filteredResources, orderedCategories, selectedCategorySet]);
  const conflictCount = filteredEvents.reduce((count, event, index) => {
    if (!event.extendedProps.conflict) return count;
    const eventStart = Date.parse(event.start);
    const eventEnd = Date.parse(event.end);
    return count + filteredEvents.slice(index + 1).filter(other => other.extendedProps.conflict && other.resourceId === event.resourceId && eventStart < Date.parse(other.end) && Date.parse(other.start) < eventEnd).length;
  }, 0);
  const filteredLabel = selectedCategories.length > 0 && selectedCategories.length < categories.length
    ? `Showing: ${orderedCategories.filter(category => selectedCategorySet.has(category)).join(", ")}`
    : "";
  const eventsForSelectedDay = selectedDay ? filteredEvents.filter(event => eventTouchesDay(event, selectedDay, companyTimeZone)).sort((a, b) => a.extendedProps.resourceName.localeCompare(b.extendedProps.resourceName) || a.title.localeCompare(b.title)) : [];
  const selectedDayGroups = useMemo(() => {
    const groups = new Map<string, ScheduleEvent[]>();
    for (const event of eventsForSelectedDay) groups.set(event.extendedProps.resourceName, [...(groups.get(event.extendedProps.resourceName) || []), event]);
    return [...groups.entries()];
  }, [eventsForSelectedDay]);
  const formatSelectedDay = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: companyTimeZone, dateStyle: "full" }).format(new Date(`${value}T12:00:00Z`));
  const dateList = (event: ScheduleEvent) => `${new Intl.DateTimeFormat("en-US", { timeZone: companyTimeZone, month: "short", day: "numeric" }).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(event.start) ? `${event.start}T12:00:00Z` : event.start))}${eventLastDate(event, companyTimeZone) !== dateKeyInZone(event.start, companyTimeZone) ? ` – ${new Intl.DateTimeFormat("en-US", { timeZone: companyTimeZone, month: "short", day: "numeric" }).format(new Date(`${eventLastDate(event, companyTimeZone)}T12:00:00Z`))}` : ""}`;

  function openEvent(event: ScheduleEvent) {
    if (event.extendedProps.kind === "event") setSelectedEvent(event);
    else setSelectedTask(event);
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      {projectId ? <h2 className="text-2xl font-bold">Project Resources</h2> : <h1 className="text-2xl font-bold">Resource Calendar</h1>}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label={projectId ? "Project Resources view" : "Resource Calendar view"} className="inline-flex rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
          {(["timeline", "calendar"] as CalendarView[]).map(view => <button key={view} type="button" role="tab" aria-selected={calendarView === view} onClick={() => setCalendarView(view)} className={`rounded-md px-4 py-2 text-sm font-semibold capitalize ${calendarView === view ? "bg-blue-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{view}</button>)}
        </div>
        <div className="text-sm">{conflictCount > 0 ? <span className="rounded bg-red-100 px-3 py-1 text-red-800">⚠️ {conflictCount} overlap{conflictCount === 1 ? "" : "s"} — same resource booked twice</span> : <span className="inline-flex items-center rounded border border-[#A9CF38] bg-[#55681C] px-3 py-1 font-semibold text-white shadow-sm">✓ No scheduling conflicts</span>}</div>
      </div>
    </div>

    <CalendarWorkflowReview context="resource" canManage={canManage} projectId={projectId} projectName={projectName} resourceCategories={categories.map(category => category.name)} selectedResourceCategories={selectedCategories} onResourceCategoriesChange={setSelectedCategories} onEventsChanged={() => { void loadSchedule(); }}>
      <div className="overflow-hidden rounded-b border border-t-0 bg-white p-2 shadow-sm sm:p-4">
        {!loaded ? <div className="p-8 text-center text-slate-500">Loading Resource Calendar…</div> : loadError ? <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</div> : selectedCategories.length === 0 ? <div role="status" className="p-10 text-center text-slate-600">No resource types selected.</div> : calendarView === "timeline" ? (
          <div className="dialoggg-calendar dialoggg-calendar-timeline"><FullCalendar
            key="resource-timeline"
            plugins={[resourceTimelinePlugin, interactionPlugin, luxonPlugin]}
            initialView="resourceTimelineMonth"
            headerToolbar={{ left: "prev,next today", center: filteredLabel ? "title resourceFilterSummary" : "title", right: "resourceTimelineMonth,resourceTimelineWeek,resourceTimelineDay" }}
            customButtons={{ resourceFilterSummary: { text: filteredLabel, click: () => undefined } }}
            resources={groupedResources as any}
            events={filteredEvents as any}
            stickyHeaderDates
            slotMinWidth={54}
            slotLabelContent={arg => {
              if (!arg.date) return arg.text;
              const { weekday, day, dateKey } = calendarDateParts(arg.date, companyTimeZone);
              const today = dateKey === dateKeyInZone(new Date(), companyTimeZone);
              return <span className="resource-calendar-timeline-date"><span className="resource-calendar-timeline-weekday">{weekday}</span><span className={`resource-calendar-timeline-day${today ? " is-today" : ""}`}>{day}</span></span>;
            }}
            slotLabelClassNames={arg => arg.date ? resourceCalendarDateClasses(arg.date, companyTimeZone) : []}
            slotLaneClassNames={arg => arg.date ? resourceCalendarDateClasses(arg.date, companyTimeZone) : []}
            eventOrder={[(a: any, b: any) => String(a.extendedProps.resourceName).localeCompare(String(b.extendedProps.resourceName)) || a.title.localeCompare(b.title)]}
            eventOrderStrict
            eventDidMount={info => { info.el.title = tooltip(info.event as any, companyTimeZone); if (info.event.extendedProps.kind === "event") info.el.classList.add("resource-calendar-event"); }}
            eventClick={info => openEvent(info.event as any)}
            timeZone={companyTimeZone}
            resourceAreaHeaderContent="Resources"
            resourceAreaWidth={isMobile ? 150 : "22%"}
            height={650}
            schedulerLicenseKey="GPL-My-Project-Is-Open-Source"
          /></div>
        ) : (
          <div className="dialoggg-calendar resource-calendar-grid-wrapper">
            <FullCalendar
              key="resource-calendar-grid"
              plugins={[dayGridPlugin, interactionPlugin, luxonPlugin]}
              initialView={calendarSubView}
              initialDate={calendarDate}
              headerToolbar={{ left: "prev,next today", center: filteredLabel ? "title resourceFilterSummary" : "title", right: "dayGridMonth,dayGridWeek,dayGridDay" }}
              customButtons={{ resourceFilterSummary: { text: filteredLabel, click: () => undefined } }}
              events={filteredEvents as any}
              stickyHeaderDates
              dayHeaderContent={arg => {
                if (arg.view.type !== "dayGridWeek") return arg.text;
                const { weekday, day, dateKey } = calendarDateParts(arg.date, companyTimeZone);
                const today = dateKey === dateKeyInZone(new Date(), companyTimeZone);
                return <span className="resource-calendar-week-date"><span className="resource-calendar-week-weekday">{weekday}</span><span className={`resource-calendar-week-day${today ? " is-today" : ""}`}>{day}</span></span>;
              }}
              dayHeaderClassNames={arg => resourceCalendarDateClasses(arg.date, companyTimeZone)}
              dayCellClassNames={arg => resourceCalendarDateClasses(arg.date, companyTimeZone)}
              dayMaxEvents
              eventOrder={[(a: any, b: any) => String(a.extendedProps.resourceName).localeCompare(String(b.extendedProps.resourceName)) || a.title.localeCompare(b.title)]}
              eventOrderStrict
              eventContent={arg => <span className="resource-calendar-event-label"><strong>{arg.event.extendedProps.resourceName}</strong> · {arg.event.extendedProps.rawTitle} ({arg.event.extendedProps.projectName})</span>}
              eventClassNames={arg => arg.event.extendedProps.kind === "event" ? ["resource-calendar-event"] : ["resource-calendar-task"]}
              eventDidMount={info => { info.el.title = tooltip(info.event as any, companyTimeZone); }}
              eventClick={info => openEvent(info.event as any)}
              datesSet={arg => { setCalendarSubView(arg.view.type); setCalendarDate(dateKeyInZone(arg.view.calendar.getDate(), companyTimeZone)); }}
              dayCellContent={arg => {
                if (!isMobile || calendarSubView !== "dayGridMonth") return arg.dayNumberText;
                const day = dateKeyInZone(arg.date, companyTimeZone);
                const count = filteredEvents.filter(event => eventTouchesDay(event, day, companyTimeZone)).length;
                return <span className="resource-calendar-day-content"><span>{arg.dayNumberText}</span>{count > 0 && <span className="resource-calendar-day-count" aria-label={`${count} resource assignments`}>{count > 9 ? "9+" : count}</span>}</span>;
              }}
              dateClick={info => { if (isMobile && calendarSubView === "dayGridMonth") setSelectedDay(dateKeyInZone(info.date, companyTimeZone)); }}
              moreLinkClick={info => { setSelectedDay(dateKeyInZone(info.date, companyTimeZone)); return "none"; }}
              timeZone={companyTimeZone}
              height={650}
            />
          </div>
        )}
      </div>
    </CalendarWorkflowReview>

    {selectedDay && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-3" onMouseDown={() => setSelectedDay(null)}><section role="dialog" aria-modal="true" aria-label={`Resources on ${formatSelectedDay(selectedDay)}`} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}><header className="sticky top-0 flex items-center justify-between border-b bg-blue-900 px-5 py-4 text-white"><h2 className="font-bold">{formatSelectedDay(selectedDay)}</h2><button type="button" aria-label="Close day assignments" onClick={() => setSelectedDay(null)} className="rounded px-2 text-2xl">×</button></header><div className="space-y-4 p-4">{selectedDayGroups.length ? selectedDayGroups.map(([resourceName, items]) => <section key={resourceName} aria-label={resourceName}><h3 className="mb-2 border-b pb-1 font-bold text-slate-800">{resourceName}</h3><ul className="space-y-2">{items.map(item => <li key={item.id}><button type="button" onClick={() => { setSelectedDay(null); openEvent(item); }} className="w-full rounded border p-3 text-left hover:bg-slate-50" style={{ borderLeftColor: item.color, borderLeftWidth: 5 }}><strong>{item.extendedProps.rawTitle}</strong><span className="block text-sm text-slate-600">{item.extendedProps.projectName} · {dateList(item)}{!item.allDay ? ` · ${new Intl.DateTimeFormat("en-US", { timeZone: companyTimeZone, hour: "numeric", minute: "2-digit" }).format(new Date(item.start))}` : ""}</span></button></li>)}</ul></section>) : <p className="py-8 text-center text-slate-600">No resource assignments on this day.</p>}</div></section></div>}
    {selectedEvent && <EventOccurrenceDialog event={toOccurrenceDialogEvent(selectedEvent)} canManage={canManage} onClose={() => setSelectedEvent(null)} onChanged={() => { void loadSchedule(); }} />}
    {selectedTask && <TaskOccurrenceDialog event={toOccurrenceDialogEvent(selectedTask)} projects={projects} timeZone={companyTimeZone} canManage={canManage} onClose={() => setSelectedTask(null)} />}
    <style jsx global>{`
      .resource-calendar-event { border-radius: 0 !important; }
      .resource-calendar-task { border-radius: 0.35rem !important; }
      .resource-calendar-event-label { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .resource-calendar-day-content { display: flex; align-items: center; justify-content: space-between; gap: 0.2rem; width: 100%; }
      .resource-calendar-day-count { display: inline-flex; min-width: 1.15rem; height: 1.15rem; align-items: center; justify-content: center; border-radius: 999px; background: #3B417D; color: #fff; padding: 0 0.2rem; font-size: 0.65rem; font-weight: 700; line-height: 1; }
      @media (max-width: 640px) {
        .resource-calendar-grid-wrapper, .resource-calendar-grid-wrapper .fc { width: 100%; max-width: 100%; min-width: 0; }
        .resource-calendar-grid-wrapper .fc-toolbar.fc-header-toolbar { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-areas: "title" "left" "right"; gap: 0.55rem; margin-bottom: 0.8rem; }
        .resource-calendar-grid-wrapper .fc-toolbar-chunk:nth-child(1) { grid-area: left; display: flex; justify-content: center; }
        .resource-calendar-grid-wrapper .fc-toolbar-chunk:nth-child(2) { grid-area: title; display: flex; min-width: 0; flex-direction: column; align-items: center; text-align: center; }
        .resource-calendar-grid-wrapper .fc-toolbar-chunk:nth-child(3) { grid-area: right; display: flex; min-width: 0; justify-content: center; }
        .resource-calendar-grid-wrapper .fc-toolbar-title { font-size: clamp(1.25rem, 6vw, 1.65rem); line-height: 1.2; }
        .resource-calendar-grid-wrapper .fc-resourceFilterSummary-button { max-width: 92vw; }
        .resource-calendar-grid-wrapper .fc-button { padding: 0.35rem 0.55rem; font-size: 0.8rem; }
        .resource-calendar-grid-wrapper .fc-scrollgrid, .resource-calendar-grid-wrapper .fc-scrollgrid table, .resource-calendar-grid-wrapper .fc-daygrid-body table { width: 100% !important; min-width: 0 !important; table-layout: fixed !important; }
        .resource-calendar-grid-wrapper .fc-daygrid-day-frame { min-width: 0; cursor: pointer; }
        .resource-calendar-grid-wrapper .fc-daygrid-day-number { width: 100%; min-width: 0; }
        .resource-calendar-grid-wrapper .fc-daygrid-event-harness, .resource-calendar-grid-wrapper .fc-daygrid-event { min-width: 0; max-width: 100%; }
        .resource-calendar-grid-wrapper .fc-daygrid-event .fc-event-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      }
      .fc .fc-resourceFilterSummary-button { max-width: min(28vw, 24rem); padding: 0.2rem 0.4rem; border: 0 !important; background: transparent !important; color: #475569 !important; box-shadow: none !important; font-size: 0.75rem; font-weight: 600; line-height: 1.2; white-space: normal; cursor: default; }
      .fc .fc-resourceFilterSummary-button:hover, .fc .fc-resourceFilterSummary-button:focus { border: 0 !important; background: transparent !important; color: #475569 !important; box-shadow: none !important; }
    `}</style>
  </div>;
}
