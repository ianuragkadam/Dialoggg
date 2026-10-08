"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";
import { formatProjectDate, normalizeProjectStatus, projectTypeFor, type ProjectUiRecord, type ProjectUiStatus } from "@/lib/projects-ui";
import ProjectTabs from "@/app/(app)/projects/[id]/tabs-client";
import ProjectFoldersPrototype from "@/components/ProjectFoldersPrototype";
import { ExternalProjectCalendarView, ExternalProjectPlanView, type ExternalCalendarItem, type ExternalPlanTask } from "@/components/ExternalProjectViews";

type Dialog = "delete" | null;

function projectDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDateKey(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function externalScheduleLabel(item: ExternalCalendarItem, timeZone: string) {
  if (item.allDay) {
    const start = item.start.slice(0, 10);
    const end = shiftDateKey(item.end.slice(0, 10), -1);
    const format = (key: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${key}T12:00:00Z`));
    return `${format(start)}${end !== start ? `–${format(end)}` : ""} · All day`;
  }
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: item.extendedProps?.timeZone || timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  return `${formatter.format(new Date(item.start))}–${formatter.format(new Date(item.end))}`;
}

function externalTaskProgress(tasks: ExternalPlanTask[]) {
  const leaves = tasks.filter(task => task.type === "task" && !task.is_root);
  if (!leaves.length) return null;
  const totalDuration = leaves.reduce((sum, task) => sum + Math.max(1, Number(task.duration) || 1), 0);
  const earned = leaves.reduce((sum, task) => sum + Math.max(1, Number(task.duration) || 1) * Math.min(1, Math.max(0, Number(task.progress) || 0)), 0);
  return Math.round((earned / totalDuration) * 100);
}

function externalCurrentPhase(tasks: ExternalPlanTask[], today: string) {
  const leaves = tasks.filter(task => task.type === "task" && !task.is_root);
  if (!leaves.length) return "No approved Tasks";
  const byId = new Map(tasks.map(task => [task.id, task]));
  const phaseFor = (task: ExternalPlanTask) => {
    let parent = byId.get(task.parent);
    while (parent && !parent.is_root) {
      if (parent.type === "project") return parent.text;
      parent = byId.get(parent.parent);
    }
    return task.text;
  };
  const incomplete = leaves.filter(task => Number(task.progress) < 1).sort((left, right) => left.start_date.localeCompare(right.start_date) || left.id - right.id);
  if (!incomplete.length) return "All approved Tasks complete";
  const active = incomplete.find(task => Number(task.progress) > 0) || incomplete.find(task => task.start_date <= today && (!task.end_date || task.end_date >= today));
  if (active) return phaseFor(active);
  const next = incomplete.find(task => task.start_date >= today) || incomplete[0];
  const label = phaseFor(next);
  if (next.start_date > today) return `Upcoming · ${label}`;
  if (next.end_date && next.end_date < today) return `Past due · ${label}`;
  return `Planned · ${label}`;
}

export default function ProjectWorkspacePrototype({ project, projectUsers, createdBy, canManage, isOwner, external, assigned = false }: { project: ProjectUiRecord; projectUsers: Array<{ full_name: string | null; email: string; role: string }>; createdBy: string | null; canManage: boolean; isOwner: boolean; external: boolean; assigned?: boolean }) {
  const [current] = useState(project); const [dialog, setDialog] = useState<Dialog>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [deleteName, setDeleteName] = useState(""); const [deleteAccepted, setDeleteAccepted] = useState(false);
  useEffect(() => { if (!dialog) return; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setDialog(null); }; document.addEventListener("keydown", escape); document.body.style.overflow = "hidden"; return () => { document.removeEventListener("keydown", escape); document.body.style.overflow = ""; }; }, [dialog]);
  async function deleteProject() { setBusy(true); setError(""); const response = await authenticatedFetch(`/api/v1/projects/${current.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: deleteName, acknowledged: deleteAccepted }) }); const payload = await response.json().catch(() => ({})) as { error?: { message?: string } }; if (!response.ok) { setBusy(false); setError(payload.error?.message || "The Project could not be permanently deleted."); setDialog(null); return; } location.assign("/projects"); }
  if (external) return <ExternalProjectViewLive project={project} />;
  const status: ProjectUiStatus = normalizeProjectStatus(current.status); const active = status === "active"; const archived = status === "archived";
  const projectEndDate = project.derived_end_date || project.end_date;
  return <div className="space-y-5 pb-10"><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"><div><h1 className="text-3xl font-bold text-slate-950">{project.name}</h1></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{active ? "Active" : "Archived"}</span>{canManage && <Link href={`/projects/${project.id}/edit`} className="inline-flex min-h-10 items-center rounded-lg border border-blue-300 px-3 py-2 text-sm font-bold text-blue-800">Edit Project</Link>}</div><p className="flex flex-wrap items-center gap-x-1 text-sm text-slate-600 lg:col-span-2"><span>{project.client_name || "No client name"} · {projectTypeFor(project)} · Start Date: {formatProjectDate(project.start_date)}</span><span>· End Date: {projectEndDate ? formatProjectDate(projectEndDate) : "Not available per project plan"}</span></p></div>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900">{error}</div>}
    <ProjectTabs project={{ ...current, status }} projectUsers={projectUsers} createdBy={createdBy} canEdit={canManage && active} canManage={canManage} assigned={assigned} />
    {archived && <section className="rounded-xl border border-red-200 bg-white p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-bold text-slate-950">Permanent deletion</h2><p className="mt-1 text-sm leading-6 text-slate-600">Permanent deletion is Owner-only and available only after Archive. An Admin cannot perform it.</p></div>{isOwner ? <button type="button" onClick={() => { setDeleteName(""); setDeleteAccepted(false); setDialog("delete"); }} className="min-h-11 rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-800">Permanently delete</button> : <button type="button" disabled title="Owner required" className="min-h-11 cursor-not-allowed rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-500">Owner required</button>}</div></section>}
    {!canManage && <section aria-label="Project state notice" className={`rounded-xl border p-4 text-sm leading-6 ${active ? "border-blue-200 bg-blue-50 text-blue-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}><strong>Employee (Internal) read-only</strong><p>{active ? "Employees can review this Project and company schedules whether assigned or unassigned." : "Archived jobs are read-only. The original Project Plan, Tasks, Events, links, history, assignments, and Microsoft folder references remain preserved."}</p></section>}
    {dialog === "delete" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role="alertdialog" aria-modal="true" aria-label="Permanently delete Project?" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5"><h2 className="text-xl font-bold text-red-900">Permanently delete Project?</h2><p className="mt-3 text-sm leading-6 text-slate-600">This irreversible Dialoggg action deletes the Project, Tasks, Events, assignments, and managed Google copies. Microsoft OneDrive/SharePoint folders are never renamed or deleted.</p><label htmlFor="delete-project-name" className="mt-4 block text-sm font-bold text-slate-800">Type <span className="select-all rounded bg-slate-100 px-1">{current.name}</span> to confirm</label><input id="delete-project-name" autoFocus value={deleteName} onChange={event => setDeleteName(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /><label className="mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950"><input type="checkbox" checked={deleteAccepted} onChange={event => setDeleteAccepted(event.target.checked)} className="mt-1" /><span>I understand this permanently removes Dialoggg Project data and cannot be undone.</span></label><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => setDialog(null)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Cancel</button><button type="button" disabled={deleteName !== current.name || !deleteAccepted || busy} onClick={deleteProject} className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Deleting…" : "Permanently delete Project"}</button></div></div></div>}
  </div>;
}

function ExternalProjectViewLive({ project }: { project: ProjectUiRecord }) {
  const [activeTab, setActiveTab] = useState<"overview" | "plan" | "calendar">("overview");
  const [tasks, setTasks] = useState<ExternalPlanTask[] | null>(null);
  const [calendarItems, setCalendarItems] = useState<ExternalCalendarItem[] | null>(null);
  const [tasksError, setTasksError] = useState("");
  const [calendarError, setCalendarError] = useState("");
  const [companyTimeZone, setCompanyTimeZone] = useState("UTC");

  useEffect(() => {
    let active = true;
    let requestVersion = 0;
    const loadEndpoint = async (url: string) => {
      try {
        const response = await authenticatedFetch(url, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error?.message || "Live Project data could not be loaded.");
        return { payload, error: "" };
      } catch (cause) {
        return { payload: null, error: cause instanceof Error ? cause.message : "Live Project data could not be loaded." };
      }
    };
    const refresh = async () => {
      const currentRequest = ++requestVersion;
      const [planResult, calendarResult, profileResult] = await Promise.all([
        loadEndpoint(`/api/projects/${project.id}/tasks`),
        loadEndpoint(`/api/projects/${project.id}/events`),
        loadEndpoint("/api/me"),
      ]);
      if (!active || currentRequest !== requestVersion) return;
      if (planResult.payload) setTasks(Array.isArray(planResult.payload.data) ? planResult.payload.data : []);
      setTasksError(planResult.error);
      if (calendarResult.payload) setCalendarItems(Array.isArray(calendarResult.payload.events) ? calendarResult.payload.events : []);
      setCalendarError(calendarResult.error);
      if (profileResult.payload?.user?.company_time_zone) setCompanyTimeZone(profileResult.payload.user.company_time_zone);
    };
    const onPlanUpdated = (event: Event) => {
      const updatedProjectId = (event as CustomEvent<{ projectId?: number }>).detail?.projectId;
      if (Number(updatedProjectId) === project.id) void refresh();
    };
    const refreshWhenVisible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("dialoggg:project-plan-updated", onPlanUpdated);
    const interval = window.setInterval(refreshWhenVisible, 60_000);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("dialoggg:project-plan-updated", onPlanUpdated);
      window.clearInterval(interval);
    };
  }, [project.id]);

  const today = projectDateKey(new Date(), companyTimeZone);
  const horizon = shiftDateKey(today, 7);
  const progress = externalTaskProgress(tasks || []);
  const phase = externalCurrentPhase(tasks || [], today);
  const upcomingItems = (calendarItems || []).filter(item => {
    if (item.allDay) {
      const lastDay = shiftDateKey(item.end.slice(0, 10), -1);
      return item.start.slice(0, 10) < horizon && lastDay >= today;
    }
    const timeZone = item.extendedProps?.timeZone || companyTimeZone;
    const startDay = projectDateKey(new Date(item.start), timeZone);
    const endDay = projectDateKey(new Date(Math.max(Date.parse(item.start), Date.parse(item.end) - 1)), timeZone);
    return startDay < horizon && endDay >= today;
  }).sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
  const upcomingTasks = upcomingItems.filter(item => item.extendedProps?.kind === "task");
  const upcomingEvents = upcomingItems.filter(item => item.extendedProps?.kind === "event");

  return <div className="mx-auto max-w-5xl space-y-6 pb-10">
    <div><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">External/Client view</span><h1 className="mt-3 text-3xl font-bold text-slate-950">{project.name}</h1><p className="mt-2 text-sm text-slate-600">{projectTypeFor(project)} · {formatProjectDate(project.start_date)} to {formatProjectDate(project.derived_end_date || project.end_date)}</p></div>
    <nav role="tablist" aria-label="Project views" className="flex flex-wrap gap-1 border-b border-slate-300 bg-white p-1">{([ ["overview", "Overview"], ["plan", "Project Plan"], ["calendar", "Project Calendar"] ] as const).map(([id, label]) => <button key={id} id={`external-${id}-tab`} aria-controls={`external-${id}-panel`} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)} className={`min-h-11 rounded-t-lg border-b-2 px-4 py-2 text-sm font-bold ${activeTab === id ? "border-blue-700 bg-blue-50 text-blue-800" : "border-transparent text-slate-600 hover:bg-slate-100"}`}>{label}</button>)}</nav>
    {activeTab === "overview" && <div id="external-overview-panel" role="tabpanel" aria-labelledby="external-overview-tab" className="space-y-6">
    <section className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-950"><strong>Simple read-only Project view</strong><p>Only approved Project progress, safe Task names/dates, the Project Calendar, and the live Common Microsoft folder reference are visible. Internal notes, other Users, Private links, dependency lag, and private Resource details are hidden.</p></section>
    <div className="grid gap-4 sm:grid-cols-3"><Summary label="Overall progress" value={tasksError ? "Unavailable" : tasks === null ? "Loading…" : progress === null ? "No approved Tasks" : `${progress}%`} /><Summary label="Current phase" value={tasksError ? "Unavailable" : tasks === null ? "Loading…" : phase} /><Summary label="Project status" value={normalizeProjectStatus(project.status)} /></div>
    <ProjectFoldersPrototype projectId={project.id} projectName={project.name} canManage={false} canEdit={false} assigned />
    <section id="external-project-calendar" className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-bold text-slate-950">Project Calendar · Next 7 days</h2><p className="mt-1 text-sm text-slate-500">Approved Tasks and Events for this assigned Project only.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{calendarItems === null ? "Loading…" : calendarError ? "Unavailable" : `${upcomingItems.length} item${upcomingItems.length === 1 ? "" : "s"}`}</span></div>{calendarError ? <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Project Calendar data is unavailable: {calendarError}</p> : calendarItems === null ? <p role="status" className="mt-4 text-sm text-slate-500">Loading Project Calendar…</p> : <div className="mt-4 grid gap-4 md:grid-cols-2"><ExternalCalendarList title="Tasks" items={upcomingTasks} timeZone={companyTimeZone} tone="blue"/><ExternalCalendarList title="Events" items={upcomingEvents} timeZone={companyTimeZone} tone="violet"/></div>}</section>
    </div>}
    {activeTab === "plan" && <div id="external-plan-panel" role="tabpanel" aria-labelledby="external-plan-tab"><ExternalProjectPlanView tasks={tasks} error={tasksError} /></div>}
    {activeTab === "calendar" && <div id="external-calendar-panel" role="tabpanel" aria-labelledby="external-calendar-tab"><ExternalProjectCalendarView items={calendarItems} error={calendarError} timeZone={companyTimeZone} /></div>}
  </div>;
}

function ExternalCalendarList({ title, items, timeZone, tone }: { title: string; items: ExternalCalendarItem[]; timeZone: string; tone: "blue" | "violet" }) {
  const styles = tone === "blue" ? "border-blue-200 bg-blue-50 text-blue-950" : "border-violet-200 bg-violet-50 text-violet-950";
  return <section className={`rounded-lg border p-3 ${styles}`} aria-label={`Upcoming ${title}`}><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-bold uppercase tracking-wide">{title}</h3><span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">{items.length}</span></div>{items.length ? <ul className="mt-2 space-y-2">{items.map(item => <li key={item.id} className="rounded-md border border-white/70 bg-white/70 p-3"><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs">{externalScheduleLabel(item, timeZone)}</p></li>)}</ul> : <p className="mt-2 text-sm">No {title.toLowerCase()} scheduled in the next 7 days.</p>}</section>;
}

function ExternalProjectView({ project }: { project: ProjectUiRecord }) { const [notice, setNotice] = useState(""); return <div className="mx-auto max-w-5xl space-y-6 pb-10"><nav aria-label="Breadcrumb" className="text-sm text-slate-500"><Link href="/projects">Projects</Link><span className="px-2">/</span><span className="font-medium text-slate-800">{project.name}</span></nav><div><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">External/Client view</span><h1 className="mt-3 text-3xl font-bold text-slate-950">{project.name}</h1><p className="mt-2 text-sm text-slate-600">{projectTypeFor(project)} · {formatProjectDate(project.start_date)} to {formatProjectDate(project.derived_end_date || project.end_date)}</p></div><section className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-950"><strong>Simple read-only Project view</strong><p>Only approved Project progress, safe Task names/dates, the Project Calendar, and the Common link are visible. Internal notes, other Users, Private links, dependency lag, and private Resource details are hidden.</p></section>{notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{notice}</div>}<div className="grid gap-4 sm:grid-cols-3"><Summary label="Overall progress" value="45%" /><Summary label="Current phase" value="Surface installation" /><Summary label="Project status" value="Active" /></div><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-950">Approved Project links</h2><p className="mt-1 text-sm text-slate-500">Private folder access is not available in this view.</p></div><div className="flex gap-2"><a href="#external-project-calendar" className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-bold text-blue-800">Project Calendar</a><button type="button" onClick={() => setNotice("Open Common preview complete. Production opens the protected Microsoft folder in a new browser tab; no tab opened and no data changed.")} className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-bold text-blue-800">Open Common</button></div></div></section><section id="external-project-calendar" className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-950">Project Calendar preview</h2><p className="mt-1 text-sm text-slate-500">Safe Task and Event names/dates for this assigned Project only.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-blue-200 bg-blue-50 p-3"><strong className="text-sm text-blue-950">Install acrylic surface</strong><p className="text-xs text-blue-800">Task · Sep 18–19 · All day</p></div><div className="rounded-lg border border-violet-200 bg-violet-50 p-3"><strong className="text-sm text-violet-950">Client walkthrough</strong><p className="text-xs text-violet-800">Event · Sep 22 · 2:00 PM</p></div></div></section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-950">Project Tasks</h2><div className="mt-3 space-y-3">{[["Site preparation","Sep 15–17","100%"],["Install acrylic surface","Sep 18–19","40%"],["Client walkthrough","Sep 22","0%"]].map(item => <div key={item[0]} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_150px_80px]"><strong className="text-sm text-slate-900">{item[0]}</strong><span className="text-sm text-slate-600">{item[1]}</span><span className="text-sm font-bold text-slate-700">{item[2]}</span></div>)}</div></section><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-950">Simple read-only Gantt</h2><p className="mt-1 text-sm text-slate-500">Enabled for this Project by an Owner/Admin. This safe view is separate from the internal original Gantt.</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">Enabled</span></div><div className="mt-4 space-y-3" aria-label="Simple read-only Gantt preview"><Bar label="Site preparation" width="100%" /><Bar label="Install acrylic surface" width="58%" /><Bar label="Client walkthrough" width="22%" /></div></section></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 font-bold text-slate-950">{value}</p></div>; } function Bar({ label, width }: { label: string; width: string }) { return <div><p className="mb-1 text-xs font-semibold text-slate-600">{label}</p><div className="h-6 rounded bg-slate-100"><div className="h-6 rounded bg-blue-600" style={{ width }} /></div></div>; }
