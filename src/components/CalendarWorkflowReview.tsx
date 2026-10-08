"use client";

import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";
import ColorSwatches from "@/components/ColorSwatches";

type CalendarContext = "project" | "master" | "resource";
type DialogName = "event-form" | "event-review" | "conflict" | null;
type RepeatName = "Does not repeat" | "Daily" | "Weekly" | "Monthly";
type ConflictDetail = { occurrenceKey: string; resourceName: string; withKind: "Task" | "Event"; withTitle: string; start: string; end: string; timeZone: string };
type UpcomingItem = { id: string; title: string; start: string; end: string; allDay: boolean; resourceNames?: string[]; conflictResourceNames?: string[]; extendedProps: { kind: string; rawTitle?: string; project_id?: number | null; projectName?: string; taskId?: number; sourceId?: string; recurring?: boolean; timeZone?: string; conflict?: boolean } };
type UpcomingResourceConflict = { resourceName: string; first: UpcomingItem; second: UpcomingItem };
function localDateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }

const COLORS = ["#7c3aed", "#2563eb", "#059669", "#d97706", "#dc2626"];
const MASTER_CALENDAR_GUIDE = [
  "This calendar shows every task and event from your active jobs in one place.",
  "To change a task's dates, open that job's Project Plan. Tasks can't be dragged here.",
  "Events (meetings, site visits) can be dragged to a new day. You'll be asked to confirm.",
  "If a change double-books someone, you'll see a warning. An Owner or Admin has to approve it.",
  "Use the filters above to show one job type or a single job.",
];
const PROJECT_CALENDAR_GUIDE = [
  "This calendar shows the tasks for this project. To see every job together, plus meetings and other events, use the Master Calendar.",
  "Task dates are set in the Project Plan. Change a date there and it updates here automatically.",
  "Click any task to see its details.",
  "Switch between month, week, and day with the buttons at the top right.",
  "To see this project in Google Calendar, click Calendar subscription and paste the link into Google Calendar. It's one-way: changes in Dialoggg show up there, but changes made in Google Calendar are not saved. Make all edits in Dialoggg.",
];
const RESOURCE_CALENDAR_GUIDE = [
  "Timeline shows each resource as a row, with their tasks across the dates. Calendar shows the same work on a regular month grid, with each item starting with the resource's name.",
  "Resources are grouped by type: Employee, Equipment, Subcontractor, Supplier. Use the checkboxes at the top of the calendar to show or hide a type. Your choice stays when you switch views.",
  "Only tasks and events with a resource assigned appear here. To assign one, use the Resources column in the Project Plan.",
  "Hover over any item to see the full task name, project, and dates.",
  "The green badge at the top means no resource is double-booked. If one is scheduled for two things at the same time, you'll be notified.",
];
const OTHER_CALENDAR_GUIDE = [
  "Task dates are edited only in the Project Plan; calendar Task dragging is disabled.",
  "Authorized Event dragging always asks for confirmation.",
  "Project Events roll up to Master Calendar as one source record.",
  "Resource conflicts warn and require Owner/Admin acknowledgement.",
  "Changes update every applicable calendar without stale duplicates.",
];
function conflictTime(value: string, timeZone: string) { return new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

function Modal({ title, children, onClose, alert = false, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; alert?: boolean; wide?: boolean }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); };
  }, [onClose]);
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" onMouseDown={onClose}><section role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title} className={`max-h-[94vh] w-full overflow-y-auto rounded-xl bg-white shadow-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`} onMouseDown={event => event.stopPropagation()}><header className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-xl border-b bg-blue-900 px-5 py-4 text-white"><h2 className="text-lg font-bold">{title}</h2><button type="button" aria-label={`Close ${title}`} onClick={onClose} className="rounded px-2 text-2xl hover:bg-white/15">×</button></header>{children}</section></div>;
}

export default function CalendarWorkflowReview({ context, canManage, projectId, projectName, projects = [], projectTypes = [], selectedProjectTypeIds = [], onProjectTypeIdsChange, onProjectIdChange, onEventsChanged, onIncludeCompletedChange, onAddEventReady, resourceCategories = [], selectedResourceCategories = [], onResourceCategoriesChange, children }: { context: CalendarContext; canManage: boolean; projectId?: number | string; projectName?: string; projects?: Array<{ id: number; name: string }>; projectTypes?: Array<{ id: number; name: string }>; selectedProjectTypeIds?: number[]; onProjectTypeIdsChange?: (ids: number[]) => void; onProjectIdChange?: (id: string) => void; onEventsChanged?: () => void; onIncludeCompletedChange?: (include:boolean)=>void; onAddEventReady?: (open: () => void) => void; resourceCategories?: string[]; selectedResourceCategories?: string[]; onResourceCategoriesChange?: (categories: string[]) => void; children?: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogName>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [behaviorOpen, setBehaviorOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProject, setSelectedProject] = useState(projectName || "");
  const [pushToProject, setPushToProject] = useState(context === "project");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState(() => localDateKey(new Date()));
  const [endDate, setEndDate] = useState(() => localDateKey(new Date()));
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("15:00");
  const [resources, setResources] = useState<string[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [repeat, setRepeat] = useState<RepeatName>("Does not repeat");
  const [endMode, setEndMode] = useState<"date" | "count" | "open">("count");
  const [repeatUntil, setRepeatUntil] = useState("2026-10-20");
  const [occurrences, setOccurrences] = useState("5");
  const [conflictAccepted, setConflictAccepted] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<UpcomingItem[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingError, setUpcomingError] = useState("");
  const [selectedUpcomingEvent, setSelectedUpcomingEvent] = useState<UpcomingItem | null>(null);
  const [selectedUpcomingTask, setSelectedUpcomingTask] = useState<UpcomingItem | null>(null);
  const [upcomingRefresh, setUpcomingRefresh] = useState(0);
  const [upcomingConflictsOpen, setUpcomingConflictsOpen] = useState(false);
  const [resourceChoices, setResourceChoices] = useState<Array<{id:number;name:string}>>([]);
  const [projectChoices, setProjectChoices] = useState<Array<{id:number;name:string}>>([]);
  const [saving, setSaving] = useState(false);
  const [pendingConflict, setPendingConflict] = useState(false);
  const [companyTimeZone,setCompanyTimeZone]=useState("UTC");
  const calendarName = context === "master" ? "Master Calendar" : context === "resource" ? "Resource Calendar" : "Project Calendar";

  useEffect(()=>{if(!canManage)return;Promise.all([fetch("/api/resources",{cache:"no-store"}).then(response=>response.json()),fetch("/api/projects",{cache:"no-store"}).then(response=>response.json())]).then(([resourceData,projectData])=>{const nextResources=(resourceData.resources||[]) as Array<{id:number;name:string}>;const nextProjects=(projectData.projects||[]) as Array<{id:number;name:string}>;setResourceChoices(nextResources);setProjectChoices(nextProjects);setResources(current=>current.length?current:nextResources.length?[nextResources[0].name]:[]);if(context==="master")setSelectedProject(current=>current||nextProjects[0]?.name||"");}).catch(()=>{});},[canManage,context]);
  useEffect(()=>{fetch("/api/me").then(response=>response.json()).then(data=>setCompanyTimeZone(data.user?.company_time_zone||"UTC"));},[]);

  useEffect(() => {
    const controller = new AbortController();
    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 7);
    const params = new URLSearchParams({ start: rangeStart.toISOString(), end: rangeEnd.toISOString() });
    const endpoint = context === "master"
      ? `/api/calendar?${params}`
      : context === "project" && projectId
        ? `/api/projects/${projectId}/events?${params}`
        : `/api/resources/schedule?${params}`;
    setUpcomingLoading(true);
    setUpcomingError("");
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || "Upcoming calendar items could not be loaded.");
        if (context === "resource") {
          const resources = new Map<string, string>((payload.resources || []).map((resource: { id: string; title: string }) => [String(resource.id), resource.title]));
          return (payload.events || []).filter((entry: any) => !projectId || Number(entry.extendedProps?.project_id) === Number(projectId)).map((entry: any) => { const resourceName = resources.get(String(entry.resourceId)); return { ...entry, resourceNames: [resourceName].filter(Boolean), conflictResourceNames: entry.extendedProps?.conflict && resourceName ? [resourceName] : [], extendedProps: { ...entry.extendedProps, kind: String(entry.extendedProps?.kind || "").toLowerCase() } }; }) as UpcomingItem[];
        }
        return payload.events as UpcomingItem[];
      })
      .then(items => {
        const startDate = localDateKey(rangeStart);
        const endDate = localDateKey(rangeEnd);
        const from = rangeStart.getTime();
        const to = rangeEnd.getTime();
        const inRange = (item: UpcomingItem) => {
          const kind = item.extendedProps?.kind?.toLowerCase();
          if (kind !== "task" && kind !== "event") return false;
          if (item.allDay) {
            const lastDate = new Date(Date.parse(`${item.end.slice(0, 10)}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
            return item.start.slice(0, 10) < endDate && lastDate >= startDate;
          }
          return Date.parse(item.start) < to && Date.parse(item.end) > from;
        };
        const ranged = (Array.isArray(items) ? items : []).filter(inRange);
        const deduplicated = new Map<string, UpcomingItem>();
        for (const item of ranged) {
          const sourceId = item.extendedProps.sourceId;
          const key = context === "resource" && sourceId ? `${item.extendedProps.kind}:${sourceId}` : item.id;
          const existing = deduplicated.get(key);
          if (existing) {
            existing.resourceNames = [...new Set([...(existing.resourceNames || []), ...(item.resourceNames || [])])];
            existing.conflictResourceNames = [...new Set([...(existing.conflictResourceNames || []), ...(item.conflictResourceNames || [])])];
          }
          else deduplicated.set(key, { ...item, resourceNames: item.resourceNames || [] });
        }
        setUpcomingItems([...deduplicated.values()].sort((left, right) => Date.parse(left.start) - Date.parse(right.start)));
      })
      .catch(error => { if (!controller.signal.aborted) setUpcomingError(error instanceof Error ? error.message : "Upcoming calendar items could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setUpcomingLoading(false); });
    return () => controller.abort();
  }, [context, projectId, upcomingRefresh]);

  useEffect(() => {
    const refresh = () => { if (!document.hidden) setUpcomingRefresh(value => value + 1); };
    const onPlanUpdated = (event: Event) => {
      const updatedProjectId = (event as CustomEvent<{ projectId?: number }>).detail?.projectId;
      if (context !== "project" || Number(updatedProjectId) === Number(projectId)) refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("dialoggg:project-plan-updated", onPlanUpdated);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("dialoggg:project-plan-updated", onPlanUpdated);
      window.clearInterval(interval);
    };
  }, [context, projectId]);

  const upcomingTasks = upcomingItems.filter(item => item.extendedProps.kind.toLowerCase() === "task");
  const upcomingEvents = upcomingItems.filter(item => item.extendedProps.kind.toLowerCase() === "event");
  const upcomingResourceConflicts = useMemo<UpcomingResourceConflict[]>(() => {
    if (context !== "resource") return [];
    const found: UpcomingResourceConflict[] = [];
    for (let left = 0; left < upcomingItems.length; left += 1) {
      const first = upcomingItems[left];
      if (!first.extendedProps.conflict) continue;
      const firstStart = Date.parse(first.start);
      const firstEnd = Date.parse(first.end);
      for (let right = left + 1; right < upcomingItems.length; right += 1) {
        const second = upcomingItems[right];
        if (!second.extendedProps.conflict) continue;
        const sharedResources = (first.conflictResourceNames || []).filter(name => (second.conflictResourceNames || []).includes(name));
        if (!sharedResources.length || firstStart >= Date.parse(second.end) || Date.parse(second.start) >= firstEnd) continue;
        for (const resourceName of sharedResources) found.push({ resourceName, first, second });
      }
    }
    return found;
  }, [context, upcomingItems]);

  function itemTitle(item: UpcomingItem) {
    if (item.extendedProps.rawTitle) return item.extendedProps.rawTitle;
    const project = projects.find(candidate => candidate.id === item.extendedProps.project_id);
    const projectSuffix = project ? ` (${project.name})` : "";
    if (projectSuffix && item.title.endsWith(projectSuffix)) return item.title.slice(0, -projectSuffix.length);
    return item.title.replace(/ \([^()]*\)$/, "");
  }

  function itemProject(item: UpcomingItem) {
    return projects.find(candidate => candidate.id === item.extendedProps.project_id)?.name || item.extendedProps.projectName || projectName || (item.extendedProps.project_id ? "Project" : "Company-wide");
  }

  function itemSchedule(item: UpcomingItem) {
    const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: companyTimeZone, month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
    if (item.allDay) {
      const lastDate = new Date(Date.parse(`${item.end.slice(0, 10)}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
      return `${dateLabel(item.start)}${lastDate !== item.start.slice(0, 10) ? `–${dateLabel(lastDate)}` : ""} · All day`;
    }
    const format = new Intl.DateTimeFormat("en-US", { timeZone: item.extendedProps.timeZone || companyTimeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    return `${format.format(new Date(item.start))}–${format.format(new Date(item.end))}`;
  }

  const recurrenceSummary = useMemo(() => {
    if (repeat === "Does not repeat") return repeat;
    if (endMode === "date") return `${repeat} until ${repeatUntil}`;
    if (endMode === "count") return `${repeat} for ${occurrences} occurrences`;
    return `${repeat} with no User-selected end date`;
  }, [repeat, endMode, repeatUntil, occurrences]);

  function toggleType(typeId: number) { onProjectTypeIdsChange?.(selectedProjectTypeIds.includes(typeId) ? selectedProjectTypeIds.filter(item => item !== typeId) : [...selectedProjectTypeIds, typeId]); }
  function toggleAllTypes() { onProjectTypeIdsChange?.(selectedProjectTypeIds.length === projectTypes.length ? [] : projectTypes.map(type => type.id)); }
  function toggleResourceCategory(category: string) { onResourceCategoriesChange?.(selectedResourceCategories.includes(category) ? selectedResourceCategories.filter(item => item !== category) : [...selectedResourceCategories, category]); }
  function toggleResource(resource: string) { setResources(current => current.includes(resource) ? current.filter(item => item !== resource) : [...current, resource]); }
  const fixedProject = context === "project" || (context === "resource" && !!projectId);
  function openEventForm() { setErrors([]); if (fixedProject) setSelectedProject(projectName || ""); setDialog("event-form"); }
  useEffect(() => { onAddEventReady?.(openEventForm); }, [onAddEventReady]);
  function reviewEvent() {
    const next: string[] = [];
    if (!title.trim()) next.push("Enter the Event Title.");
    if (!startDate || !endDate) next.push("Choose the Event start and end date.");
    if (!allDay && (!startTime || !endTime || `${endDate}T${endTime}` <= `${startDate}T${startTime}`)) next.push("Timed Event end must be after its start.");
    if (repeat !== "Does not repeat" && endMode === "count" && (!Number.isInteger(Number(occurrences)) || Number(occurrences) < 1)) next.push("Occurrences must be a whole number of at least 1.");
    if (repeat !== "Does not repeat" && endMode === "date" && repeatUntil < startDate) next.push("Recurrence end date cannot be before the Event starts.");
    setErrors(next); if (!next.length) setDialog("event-review");
  }
  async function persistEvent(confirmConflicts=false){setSaving(true);setErrors([]);const selectedProjectId=fixedProject?projectId:(projectChoices.find(project=>project.name===selectedProject)?.id??null);const resourceIds=resourceChoices.filter(resource=>resources.includes(resource.name)).map(resource=>resource.id);const body={title,description,projectId:selectedProjectId,pushToProject:fixedProject?true:pushToProject,timingMode:allDay?"all_day":"timed",startDate,endDate,startTime,endTime,color,resourceIds,recurrenceFrequency:repeat==="Does not repeat"?null:repeat.toLowerCase(),recurrenceEndMode:repeat==="Does not repeat"?"none":endMode==="open"?"none":endMode,recurrenceEndDate:endMode==="date"?repeatUntil:null,recurrenceCount:endMode==="count"?Number(occurrences):null,confirmConflicts};try{const endpoint=fixedProject&&projectId?`/api/projects/${projectId}/events`:"/api/events";const response=await authenticatedFetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const data=await response.json();if(response.status===409&&data?.error?.code==="RESOURCE_CONFLICT"){setConflicts(Array.isArray(data?.error?.details?.conflicts)?data.error.details.conflicts:[]);setPendingConflict(true);setConflictAccepted(false);setDialog("conflict");return;}if(!response.ok)throw new Error(data?.error?.message||"The Event could not be saved.");setConflicts([]);setPendingConflict(false);setUpcomingRefresh(value=>value+1);onEventsChanged?.();finish("Event saved. Project, Master, and Resource Calendars now use the same source record.");}catch(error){setDialog("event-form");setErrors([error instanceof Error?error.message:"The Event could not be saved."]);}finally{setSaving(false);}}
  function attemptApply() { void persistEvent(false); }
  function finish(message: string) { setDialog(null); setNotice(message); }

  return <section className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm" aria-label={`${calendarName} workflow review`}>
    <button type="button" aria-expanded={controlsOpen} aria-controls="calendar-controls-content" onClick={() => setControlsOpen(open => !open)} className="flex w-full items-center justify-end gap-3 bg-gradient-to-r from-blue-950 to-blue-800 px-4 py-2 text-right text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-inset"><h2 className="text-lg font-bold">How It Works</h2><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10"><svg viewBox="0 0 24 24" className={`h-5 w-5 transition-transform ${controlsOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg></span></button>
    {notice && <div role="status" className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{notice}</div>}
    {controlsOpen && context === "project" && <ul id="calendar-controls-content" className="list-disc space-y-2 border-t border-blue-700 bg-blue-950 px-5 py-4 pl-10 text-sm leading-6 text-white">{PROJECT_CALENDAR_GUIDE.map(line => <li key={line}>{line}</li>)}</ul>}
    {controlsOpen && context === "resource" && <div id="calendar-controls-content" className="p-4">
      <div className="space-y-4">
      </div>
    </div>}
    {controlsOpen && context !== "project" && <section className="mx-4 my-4 overflow-hidden rounded-lg border border-amber-200 bg-amber-50 text-amber-950" aria-labelledby="calendar-behavior-heading"><button type="button" aria-expanded={behaviorOpen} aria-controls="calendar-behavior-details" onClick={() => setBehaviorOpen(open => !open)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-bold hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-inset"><span id="calendar-behavior-heading">{context === "master" ? "How this works" : "How it works"}</span><svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 transition-transform ${behaviorOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg></button>{behaviorOpen && <ul id="calendar-behavior-details" className="list-disc space-y-1.5 border-t border-amber-200 px-4 py-3 pl-9 text-xs leading-5">{(context === "master" ? MASTER_CALENDAR_GUIDE : RESOURCE_CALENDAR_GUIDE).map(line => <li key={line}>{line}</li>)}</ul>}</section>}
    {context === "master" && <div className="mx-4 my-4 rounded-lg border bg-slate-50 p-3"><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-end"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Project Type filter</p><details className="group relative mt-1"><summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md border bg-white px-3 py-2 text-sm font-normal marker:hidden focus:outline-none focus:ring-2 focus:ring-blue-500"><span className="truncate">{!projectTypes.length ? "No job types available" : selectedProjectTypeIds.length === projectTypes.length ? "All job types" : selectedProjectTypeIds.length === 0 ? "No job types selected" : selectedProjectTypeIds.length === 1 ? projectTypes.find(type => type.id === selectedProjectTypeIds[0])?.name || "1 job type selected" : `${selectedProjectTypeIds.length} job types selected`}</span><svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5"/></svg></summary><fieldset className="absolute left-0 top-full z-40 mt-1 max-h-64 w-full min-w-0 overflow-y-auto sm:min-w-64 rounded-md border bg-white p-2 shadow-xl"><legend className="sr-only">Choose Project Types for the calendar</legend><label className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm font-semibold hover:bg-slate-100"><input type="checkbox" checked={projectTypes.length > 0 && selectedProjectTypeIds.length === projectTypes.length} disabled={!projectTypes.length} onChange={toggleAllTypes} className="accent-blue-700"/>All</label><div className="my-1 border-t"/>{projectTypes.map(type => <label key={type.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-slate-100"><input type="checkbox" checked={selectedProjectTypeIds.includes(type.id)} onChange={() => toggleType(type.id)} className="accent-blue-700"/>{type.name}</label>)}{!projectTypes.length && <p className="px-2 py-2 text-sm text-slate-500">No job types are available.</p>}</fieldset></details></div><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Job filter<select value={projectId === "all" ? (includeCompleted ? "all" : "active") : String(projectId ?? "active")} onChange={event => { const value = event.target.value; if (value === "all") { onProjectIdChange?.("all"); setIncludeCompleted(true); onIncludeCompletedChange?.(true); } else if (value === "active") { onProjectIdChange?.("all"); setIncludeCompleted(false); onIncludeCompletedChange?.(false); } else { onProjectIdChange?.(value); setIncludeCompleted(false); onIncludeCompletedChange?.(false); } }} className="mt-1 w-full min-h-10 rounded-md border bg-white px-3 py-2 text-sm font-normal"><option value="active">Active Jobs</option><option value="all">All Jobs</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div><p className="mt-2 text-xs text-slate-500">Choose one or more job types and either all active jobs, all jobs, or one individual job.</p></div>}
    {context === "resource" && <div className="mx-4 my-4 rounded-lg border bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Resource Type filter</p><div className="flex gap-3 text-xs font-semibold"><button type="button" onClick={() => onResourceCategoriesChange?.(resourceCategories)} className="text-blue-800 underline">Select all</button><button type="button" onClick={() => onResourceCategoriesChange?.([])} className="text-blue-800 underline">Clear all</button></div></div><fieldset className="mt-2 flex flex-wrap gap-x-4 gap-y-2"><legend className="sr-only">Filter resources by type</legend>{resourceCategories.map(category => <label key={category} className="inline-flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={selectedResourceCategories.includes(category)} onChange={() => toggleResourceCategory(category)} className="accent-blue-700"/>{category}</label>)}{resourceCategories.length === 0 && <p className="text-sm text-slate-500">No resource types available.</p>}</fieldset></div>}
    {context === "resource" && <div role={upcomingLoading || upcomingError ? "status" : upcomingResourceConflicts.length ? "alert" : "status"} className={`mx-4 my-4 rounded-lg border p-3 text-sm ${upcomingError ? "border-amber-200 bg-amber-50 text-amber-950" : upcomingResourceConflicts.length ? "border-red-200 bg-red-50 text-red-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
      {upcomingLoading ? <p>Checking Resource overlaps for the next 7 days…</p> : upcomingError ? <p>Upcoming Resource overlaps could not be checked: {upcomingError}</p> : upcomingResourceConflicts.length === 0 ? <p><strong>No Resource overlaps in the next 7 days.</strong></p> : <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><strong>{upcomingResourceConflicts.length} Resource overlap{upcomingResourceConflicts.length === 1 ? "" : "s"} in the next 7 days</strong><p className="mt-1 text-xs">These are calculated from scheduled Tasks and Events assigned to the same Resource.</p></div><button type="button" aria-expanded={upcomingConflictsOpen} onClick={() => setUpcomingConflictsOpen(open => !open)} className="shrink-0 rounded border border-red-300 bg-white px-3 py-2 text-xs font-bold">{upcomingConflictsOpen ? "Hide overlaps" : "Review overlaps"}</button></div>}
      {!upcomingLoading && !upcomingError && upcomingConflictsOpen && upcomingResourceConflicts.length > 0 && <ul className="mt-3 space-y-2 border-t border-red-200 pt-3">{upcomingResourceConflicts.map(conflict => <li key={`${conflict.resourceName}-${conflict.first.id}-${conflict.second.id}`} className="rounded border border-red-200 bg-white/70 p-3"><strong>{conflict.resourceName}</strong><p className="mt-1">{itemTitle(conflict.first)} ({itemProject(conflict.first)}) overlaps {itemTitle(conflict.second)} ({itemProject(conflict.second)}).</p><p className="mt-1 text-xs">{itemSchedule(conflict.first)} · {itemSchedule(conflict.second)}</p></li>)}</ul>}
    </div>}
    {children}
    {context === "master" ? <section className="grid gap-3 p-4 md:grid-cols-2" aria-label="Upcoming Tasks and Events"><h2 className="sr-only">Upcoming in the next 7 days</h2>
      <article className="rounded-lg border border-blue-200 bg-blue-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-blue-700">Tasks · Next 7 days</p><p className="mt-1 text-xs text-blue-900">Across all active Projects</p></div><span aria-label={`${upcomingTasks.length} tasks`} className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-900">{upcomingTasks.length}</span></div>{upcomingLoading ? <p className="mt-4 text-sm text-slate-500">Loading upcoming Tasks…</p> : upcomingError ? <p role="alert" className="mt-4 text-sm text-red-700">{upcomingError}</p> : upcomingTasks.length ? <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">{upcomingTasks.map(item => <li key={item.id} className="rounded-md border border-blue-200 bg-white/70 p-3"><p className="font-bold text-blue-950">{itemTitle(item)}</p><p className="mt-1 text-sm text-blue-900">{itemProject(item)} · {itemSchedule(item)}</p>{item.extendedProps.project_id && item.extendedProps.taskId && <a href={`/projects/${item.extendedProps.project_id}${canManage?`?editTaskId=${encodeURIComponent(item.extendedProps.taskId)}`:""}#plan`} className="mt-2 inline-block text-sm font-bold text-blue-800 underline">{canManage?"Edit in Project Plan":"Open Project Plan"}</a>}</li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No Tasks are scheduled in the next 7 days.</p>}</article>
      <article className="rounded-lg border border-violet-200 bg-violet-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-violet-700">Events · Next 7 days</p><p className="mt-1 text-xs text-violet-900">Across all active Projects and company calendar</p></div><span aria-label={`${upcomingEvents.length} events`} className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-900">{upcomingEvents.length}</span></div>{upcomingLoading ? <p className="mt-4 text-sm text-slate-500">Loading upcoming Events…</p> : upcomingError ? <p role="alert" className="mt-4 text-sm text-red-700">{upcomingError}</p> : upcomingEvents.length ? <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">{upcomingEvents.map(item => <li key={item.id}><button type="button" onClick={() => setSelectedUpcomingEvent(item)} className="w-full rounded-md border border-violet-200 bg-white/70 p-3 text-left hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-700"><span className="block font-bold text-violet-950">{itemTitle(item)}</span><span className="mt-1 block text-sm text-violet-900">{itemProject(item)} · {itemSchedule(item)}{item.extendedProps.recurring ? " · Repeats" : ""}</span><span className="mt-2 block text-sm font-bold text-violet-800 underline">Open Event details</span></button></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No Events are scheduled in the next 7 days.</p>}</article>
    </section> : <section className="grid gap-3 p-4 md:grid-cols-2" aria-label="Upcoming Tasks and Events">
      <h2 className="sr-only">Upcoming in the next 7 days</h2>
      <article className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-blue-700">Tasks · Next 7 days</p><p className="mt-1 text-xs text-blue-900">{fixedProject ? "This Project" : "Assigned to this Resource"}</p></div><span aria-label={`${upcomingTasks.length} tasks`} className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-900">{upcomingTasks.length}</span></div>
        {upcomingLoading ? <p className="mt-4 text-sm text-slate-500">Loading upcoming Tasks…</p> : upcomingError ? <p role="alert" className="mt-4 text-sm text-red-700">{upcomingError}</p> : upcomingTasks.length ? <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">{upcomingTasks.map(item => <li key={item.id} className="rounded-md border border-blue-400 bg-blue-950 p-3 text-white"><button type="button" onClick={() => setSelectedUpcomingTask(item)} className="w-full text-left text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><span className="block font-bold text-white">{itemTitle(item)}</span><span className="mt-1 block text-sm text-blue-100">{itemProject(item)} · {itemSchedule(item)}</span>{context === "resource" && item.resourceNames?.length ? <span className="mt-1 block text-xs text-blue-200">{item.resourceNames.join(", ")}</span> : null}<span className="mt-2 block text-sm font-bold text-amber-300 underline">Open Task details</span></button>{item.extendedProps.project_id && item.extendedProps.taskId && <a href={`/projects/${item.extendedProps.project_id}${canManage ? `?editTaskId=${encodeURIComponent(item.extendedProps.taskId)}` : ""}#plan`} className="mt-2 inline-block text-sm font-bold text-amber-300 underline">{canManage ? "Edit in Project Plan" : "Open Project Plan"}</a>}</li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No Tasks are scheduled in the next 7 days.</p>}
      </article>
      <article className="rounded-lg border border-violet-200 bg-violet-50 p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-violet-700">Events · Next 7 days</p><p className="mt-1 text-xs text-violet-900">{fixedProject ? "This Project and its shared Events" : "Assigned to this Resource"}</p></div><span aria-label={`${upcomingEvents.length} events`} className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-900">{upcomingEvents.length}</span></div>
        {upcomingLoading ? <p className="mt-4 text-sm text-slate-500">Loading upcoming Events…</p> : upcomingError ? <p role="alert" className="mt-4 text-sm text-red-700">{upcomingError}</p> : upcomingEvents.length ? <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">{upcomingEvents.map(item => <li key={item.id}><button type="button" onClick={() => setSelectedUpcomingEvent(item)} className="w-full rounded-md border border-violet-400 bg-blue-950 p-3 text-left text-white hover:bg-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><span className="block font-bold text-white">{itemTitle(item)}</span><span className="mt-1 block text-sm text-blue-100">{itemProject(item)} · {itemSchedule(item)}{item.extendedProps.recurring ? " · Repeats" : ""}</span>{context === "resource" && item.resourceNames?.length ? <span className="mt-1 block text-xs text-violet-200">{item.resourceNames.join(", ")}</span> : null}<span className="mt-2 block text-sm font-bold text-amber-300 underline">Open Event details</span></button></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No Events are scheduled in the next 7 days.</p>}
      </article>
    </section>}

    {dialog === "event-form" && <Modal title="Add Event" onClose={() => setDialog(null)} wide><div className="space-y-5 p-5">{errors.length > 0 && <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"><strong>Please fix the following:</strong><ul className="mt-1 list-disc pl-5">{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}<div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Event Title <span className="text-red-600">*</span><input id="event-title" value={title} onChange={event => setTitle(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 font-normal"/></label><label className="text-sm font-bold">Project {fixedProject ? <span className="text-slate-500">(fixed to this Project)</span> : <span className="text-slate-500">(optional)</span>}<select value={selectedProject} disabled={fixedProject} onChange={event => setSelectedProject(event.target.value)} className="mt-1 w-full rounded border bg-white px-3 py-2 font-normal disabled:bg-slate-100"><option value="">No Project · Master-only company Event</option>{fixedProject && projectName && <option>{projectName}</option>}{!fixedProject && projectChoices.map(project=><option key={project.id}>{project.name}</option>)}</select></label></div><label className="block text-sm font-bold">Description <span className="text-slate-500">(optional)</span><textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} className="mt-1 w-full rounded border px-3 py-2 font-normal"/></label>{context === "master" && selectedProject && <label className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><input type="checkbox" checked={pushToProject} onChange={event => setPushToProject(event.target.checked)} className="mt-1"/><span><strong>Push to Project Calendar</strong><span className="mt-1 block text-xs">Off keeps this Event on Master Calendar only. The optional Project still supplies its name prefix and Project Type filter.</span></span></label>}<fieldset><legend className="text-sm font-bold">Timing</legend><div className="mt-2 flex gap-4 text-sm"><label><input type="radio" name="timing" checked={allDay} onChange={() => setAllDay(true)} className="mr-2"/>All day</label><label><input type="radio" name="timing" checked={!allDay} onChange={() => setAllDay(false)} className="mr-2"/>Timed</label></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-bold">Start Date<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 font-normal"/></label>{!allDay && <label className="text-xs font-bold">Start Time<input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 font-normal"/></label>}<label className="text-xs font-bold">End Date<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 font-normal"/></label>{!allDay && <label className="text-xs font-bold">End Time<input type="time" value={endTime} onChange={event => setEndTime(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 font-normal"/></label>}</div><p className="mt-2 text-xs text-slate-500">Timed Events use the Company Time Zone and keep their intended local time across daylight-saving changes.</p></fieldset><div className="grid gap-4 sm:grid-cols-2"><fieldset><legend className="text-sm font-bold">Resources <span className="font-normal text-slate-500">(optional, multiple)</span></legend><div className="mt-2 space-y-2 rounded border p-3 text-sm">{resourceChoices.length?resourceChoices.map(resource => <label key={resource.id} className="block"><input type="checkbox" checked={resources.includes(resource.name)} onChange={() => toggleResource(resource.name)} className="mr-2"/>{resource.name}</label>):<span className="text-slate-500">No active Resources</span>}</div></fieldset><fieldset><legend className="text-sm font-bold">Event Color</legend><ColorSwatches label="Event color" colors={COLORS} value={color} onChange={setColor} /></fieldset></div><fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-bold">Recurrence</legend><label className="text-sm">Repeats<select value={repeat} onChange={event => setRepeat(event.target.value as RepeatName)} className="ml-2 rounded border bg-white px-3 py-2">{(["Does not repeat", "Daily", "Weekly", "Monthly"] as RepeatName[]).map(item => <option key={item}>{item}</option>)}</select></label>{repeat !== "Does not repeat" && <div className="mt-3 space-y-2 text-sm"><p className="font-semibold">Ends</p><label className="block"><input type="radio" name="end-mode" checked={endMode === "date"} onChange={() => setEndMode("date")} className="mr-2"/>On date <input aria-label="Recurrence end date" type="date" value={repeatUntil} onChange={event => setRepeatUntil(event.target.value)} disabled={endMode !== "date"} className="ml-2 rounded border px-2 py-1 disabled:bg-slate-100"/></label><label className="block"><input type="radio" name="end-mode" checked={endMode === "count"} onChange={() => setEndMode("count")} className="mr-2"/>After <input aria-label="Number of occurrences" type="number" min="1" step="1" value={occurrences} onChange={event => setOccurrences(event.target.value)} disabled={endMode !== "count"} className="mx-2 w-20 rounded border px-2 py-1 disabled:bg-slate-100"/>occurrences</label><label className="block"><input type="radio" name="end-mode" checked={endMode === "open"} onChange={() => setEndMode("open")} className="mr-2"/>No User-selected end date <span className="text-xs text-slate-500">(loaded through a safe future horizon)</span></label></div>}</fieldset></div><footer className="flex justify-end gap-2 border-t px-5 py-4"><button type="button" onClick={() => setDialog(null)} className="rounded border px-4 py-2 text-sm font-bold">Cancel</button><button type="button" onClick={reviewEvent} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white">Review Event</button></footer></Modal>}

    {dialog === "event-review" && <Modal title="Review Event" onClose={() => setDialog("event-form")}><div className="space-y-3 p-5 text-sm"><dl className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[120px_1fr] rounded-lg border bg-slate-50 p-3"><dt className="text-slate-500">Title</dt><dd className="font-bold">{title}</dd><dt className="text-slate-500">Calendar</dt><dd>{context === "master" && !pushToProject ? "Master Calendar only" : `${calendarName} and Master Calendar`}</dd><dt className="text-slate-500">Project</dt><dd>{selectedProject || "None"}</dd><dt className="text-slate-500">Timing</dt><dd>{allDay ? `${startDate} to ${endDate} · All day` : `${startDate} ${startTime} to ${endDate} ${endTime} · ${companyTimeZone}`}</dd><dt className="text-slate-500">Resources</dt><dd>{resources.length ? resources.join(", ") : "None"}</dd><dt className="text-slate-500">Recurrence</dt><dd>{recurrenceSummary}</dd></dl>{repeat !== "Does not repeat" && <p className="rounded border border-violet-200 bg-violet-50 p-3 text-violet-950">Future edits or deletion will ask: <strong>This occurrence</strong> or <strong>Entire series</strong>. “This and following” is not part of v1.</p>}</div><footer className="flex justify-end gap-2 border-t px-5 py-4"><button type="button" onClick={() => setDialog("event-form")} className="rounded border px-4 py-2 text-sm font-bold">Back to edit</button><button type="button" disabled={saving} onClick={attemptApply} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving?"Saving…":"Save Event"}</button></footer></Modal>}

    {dialog === "conflict" && <Modal title="Resource scheduling conflict" alert onClose={() => setDialog(null)}><div className="space-y-3 p-5 text-sm"><p>{conflicts.length ? <>The following live assignments overlap <strong>{title}</strong>.</> : <>One or more Resources are already scheduled while <strong>{title}</strong> is scheduled.</>}</p>{conflicts.length>0&&<ul className="space-y-2">{conflicts.map((conflict,index)=><li key={`${conflict.occurrenceKey}-${conflict.resourceName}-${index}`} className="rounded border border-red-200 bg-red-50 p-3 text-red-950"><strong>{conflict.resourceName}</strong> conflicts with {conflict.withKind} <strong>{conflict.withTitle}</strong><span className="block">{conflictTime(conflict.start,conflict.timeZone)}–{conflictTime(conflict.end,conflict.timeZone)} · {selectedProject || "No Project"}</span></li>)}</ul>}{canManage ? <label className="flex items-start gap-3 rounded border p-3"><input type="checkbox" checked={conflictAccepted} onChange={event => setConflictAccepted(event.target.checked)} className="mt-1"/><span>I reviewed this conflict and intend to keep the overlapping Resource assignment.</span></label> : <p className="rounded border bg-slate-50 p-3">An Owner/Admin must review and confirm this intentional overlap.</p>}</div><footer className="flex justify-end gap-2 border-t px-5 py-4"><button type="button" onClick={() => setDialog(null)} className="rounded border px-4 py-2 text-sm font-bold">Cancel</button>{canManage && <button type="button" disabled={!conflictAccepted||saving} onClick={() => pendingConflict?void persistEvent(true):finish("Conflict reviewed.")} className="rounded bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Keep assignment</button>}</footer></Modal>}

    {selectedUpcomingTask && <Modal title="Task details" onClose={() => setSelectedUpcomingTask(null)}><div className="space-y-3 p-5 text-sm"><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-900">Live Task · Project Plan source</span><h3 className="text-lg font-bold">{itemTitle(selectedUpcomingTask)}</h3><dl className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-slate-500">Project</dt><dd>{itemProject(selectedUpcomingTask)}</dd><dt className="text-slate-500">Schedule</dt><dd>{itemSchedule(selectedUpcomingTask)}</dd><dt className="text-slate-500">Resources</dt><dd>{selectedUpcomingTask.resourceNames?.length ? selectedUpcomingTask.resourceNames.join(", ") : "No Resource assigned"}</dd></dl><p className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-950">Task dates are changed in the Project Plan so dependencies and other calendars stay in sync.</p></div><footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setSelectedUpcomingTask(null)} className="rounded border px-4 py-2 text-sm font-bold">Close</button>{selectedUpcomingTask.extendedProps.project_id && selectedUpcomingTask.extendedProps.taskId && <a href={`/projects/${selectedUpcomingTask.extendedProps.project_id}${canManage ? `?editTaskId=${encodeURIComponent(selectedUpcomingTask.extendedProps.taskId)}` : ""}#plan`} className="rounded bg-blue-700 px-4 py-2 text-center text-sm font-bold text-white">{canManage ? "Edit in Project Plan" : "Open Project Plan"}</a>}</footer></Modal>}
    {selectedUpcomingEvent && <Modal title="Event details" onClose={() => setSelectedUpcomingEvent(null)}><div className="space-y-3 p-5 text-sm"><span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-900">Live calendar Event</span><h3 className="text-lg font-bold">{itemTitle(selectedUpcomingEvent)}</h3><p>{itemSchedule(selectedUpcomingEvent)}{selectedUpcomingEvent.extendedProps.recurring ? " · Repeats" : ""}</p><p className="text-slate-600">Project: {itemProject(selectedUpcomingEvent)}</p>{selectedUpcomingEvent.resourceNames?.length ? <p className="text-slate-600">Resources: {selectedUpcomingEvent.resourceNames.join(", ")}</p> : null}{selectedUpcomingEvent.extendedProps.recurring && <p className="rounded border border-violet-200 bg-violet-50 p-3 text-violet-950">This Event is part of a recurring series. Open it on the calendar to review or edit the occurrence.</p>}</div><footer className="flex justify-end gap-2 border-t px-5 py-4"><button type="button" onClick={() => setSelectedUpcomingEvent(null)} className="rounded border px-4 py-2 text-sm font-bold">Close</button></footer></Modal>}
  </section>;
}
