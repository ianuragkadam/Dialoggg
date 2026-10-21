"use client";

import { useEffect, useMemo, useState } from "react";

type CalendarEvent = { id: string | number; title: string; start: string; end?: string; allDay?: boolean; color?: string; extendedProps?: { kind?: string; project_id?: number | null } };
type PrintJob = { id: number; name: string; project_type_id: number; status?: string };
type Props = { open: boolean; onClose: () => void; jobs: PrintJob[]; currentJobId: string; selectedProjectTypeIds: number[]; includeArchived: boolean; start: string; end: string; focusDate: string; timeZone: string };
type Mode = "screen" | "week" | "two-weeks" | "month" | "custom";
const keyDate = (date: Date) => date.toISOString().slice(0, 10);
const atNoon = (key: string) => new Date(`${key}T12:00:00Z`);
const shift = (key: string, days: number) => { const d = atNoon(key); d.setUTCDate(d.getUTCDate() + days); return keyDate(d); };
const safeColor = (value?: string) => value && (/^#[\da-f]{3,8}$/i.test(value) || /^(?:rgb|rgba|hsl|hsla)\([\d.,%\s+-]+\)$/i.test(value)) ? value : "#3b417d";
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const fmt = (key: string, zone: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) => new Intl.DateTimeFormat("en-US", { ...options, timeZone: zone }).format(atNoon(key));
function bar(event: CalendarEvent) {
  const color = safeColor(event.color);
  return `<div class="event"><svg class="paint" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true"><rect width="100%" height="100%" rx="2" fill="${color}" stroke="none" stroke-width="0"/></svg><span>${esc(event.title)}</span></div>`;
}
function makePage(days: string[], events: CalendarEvent[], zone: string, title: string, page: number, total: number) {
  const rows: string[][] = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const body = rows.map(week => `<tr>${week.map(day => {
    const next = shift(day, 1);
    const items = events.filter(event => event.start.slice(0, 10) < next && (event.end ? event.end.slice(0, 10) > day : event.start.slice(0, 10) === day));
    return `<td><div class="day">${atNoon(day).getUTCDate()}</div>${items.map(bar).join("")}</td>`;
  }).join("")}</tr>`).join("");
  return `<article class="paper"><header><div><b>${esc(title)}</b><small>Dialoggg</small></div><div class="right"><b>${esc(fmt(days[0], zone))} – ${esc(fmt(days.at(-1)!, zone))}</b><small>Printed ${esc(new Intl.DateTimeFormat("en-US", { timeZone: zone, dateStyle: "medium" }).format(new Date()))}</small></div></header><table><thead><tr>${labels.map(day => `<th>${day}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table><footer><span>dialoggg.com</span><span>Page ${page + 1} of ${total}</span></footer></article>`;
}
function printHtml(pages: string[], orientation: "landscape" | "portrait") { return `<!doctype html><html><head><meta charset="utf-8"><title>Master Calendar</title><style>@page{size:Letter ${orientation};margin:.3in}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{margin:0;color:#172033;font:9px Arial,sans-serif}.paper{position:relative;min-height:7.8in;padding:.14in .14in .32in;break-after:page;page-break-after:always;overflow:hidden}.paper:last-child{break-after:auto;page-break-after:auto}header{display:flex;justify-content:space-between;border-bottom:1px solid #9ca3af;padding-bottom:5px;margin-bottom:7px}header b{font-size:14px}header small{display:block;color:#526071;margin-top:3px}.right{text-align:right}table{width:100%;table-layout:fixed;border-collapse:collapse}th,td{border:1px solid #cbd5e1}th{height:20px;background:#11163e;color:#fff}td{height:1.12in;vertical-align:top;padding:2px}.day{text-align:right;margin-bottom:3px}.event{position:relative;isolation:isolate;display:block;min-height:12px;margin:1px 0;padding:2px 3px;overflow:hidden;border:0!important;outline:0!important;box-shadow:none!important;border-radius:2px;color:white!important;font-size:7px;line-height:1.15}.paint{position:absolute;inset:0;z-index:-1;width:100%;height:100%;min-height:12px;border:0;outline:0;box-shadow:none}.paint rect{stroke:none!important;stroke-width:0!important}.event span{position:relative;z-index:1}footer{position:absolute;left:.14in;right:.14in;bottom:.1in;display:flex;justify-content:space-between;color:#64748b;font-size:7px}@media screen{body{padding:12px;background:#fff}.paper{width:100%;aspect-ratio:${orientation === "landscape" ? "11/8.5" : "8.5/11"};min-height:0;box-shadow:0 2px 12px #0002;margin:0 auto 12px;overflow:auto}td{height:80px}}</style></head><body>${pages.join("")}</body></html>`; }

export default function MasterCalendarPrintDialog({ open, onClose, jobs, currentJobId, selectedProjectTypeIds, includeArchived, start, end, focusDate, timeZone }: Props) {
  const [mode, setMode] = useState<Mode>("week");
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(shift(end, -1));
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [includeTasks, setIncludeTasks] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(true);
  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
  const [includeCompanyEvents, setIncludeCompanyEvents] = useState(true);
  const [printEvents, setPrintEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(0);
  const [printing, setPrinting] = useState(false);
  useEffect(() => { if (open) {
    setMode("week"); setFrom(start); setTo(shift(end, -1)); setPage(0);
    const shownJobs = jobs.filter(job => (includeArchived || job.status === "active") && selectedProjectTypeIds.includes(job.project_type_id));
    setSelectedJobIds(currentJobId === "all" ? shownJobs.map(job => job.id) : shownJobs.filter(job => String(job.id) === currentJobId).map(job => job.id));
    setIncludeCompanyEvents(currentJobId === "all");
  } }, [open, start, end, jobs, currentJobId, selectedProjectTypeIds, includeArchived]);
  const range = useMemo(() => {
    let first = start, last = shift(end, -1);
    if (mode === "week") { first = shift(focusDate, -atNoon(focusDate).getUTCDay()); last = shift(first, 6); }
    if (mode === "two-weeks") { first = focusDate; last = shift(first, 13); }
    if (mode === "month") { first = `${focusDate.slice(0, 7)}-01`; const d = atNoon(first); d.setUTCMonth(d.getUTCMonth() + 1); last = shift(keyDate(d), -1); }
    if (mode === "custom") { first = from; last = to; }
    return { first, last };
  }, [mode, start, end, focusDate, from, to]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ start: range.first, end: shift(range.last, 1), include_archived: "true" });
    setLoadingEvents(true); setLoadError(""); setPrintEvents([]);
    fetch(`/api/calendar?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Calendar events could not be loaded for printing.");
        const payload = await response.json() as { events?: CalendarEvent[] };
        setPrintEvents(payload.events || []);
      })
      .catch(error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Calendar events could not be loaded for printing."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingEvents(false); });
    return () => controller.abort();
  }, [open, range.first, range.last]);
  const chosenJobs = useMemo(() => new Set(selectedJobIds), [selectedJobIds]);
  const filteredEvents = useMemo(() => printEvents.filter(event => {
    const projectId = event.extendedProps?.project_id;
    if (projectId == null) return includeCompanyEvents;
    return chosenJobs.has(Number(projectId));
  }).filter(event => event.extendedProps?.kind === "task" ? includeTasks : includeEvents), [printEvents, chosenJobs, includeCompanyEvents, includeTasks, includeEvents]);
  const pages = useMemo(() => {
    const days: string[] = []; for (let day = range.first; day <= range.last && days.length < 400; day = shift(day, 1)) days.push(day);
    const first = shift(days[0] ?? range.first, -atNoon(days[0] ?? range.first).getUTCDay());
    const aligned = Array.from({ length: Math.ceil(((atNoon(days[0] ?? range.first).getUTCDay() + days.length) || 7) / 7) * 7 }, (_, i) => shift(first, i));
    const chunks: string[][] = []; for (let i = 0; i < aligned.length; i += 35) chunks.push(aligned.slice(i, i + 35));
    return chunks.map((chunk, index) => makePage(chunk, filteredEvents, timeZone, "Master Calendar", index, chunks.length));
  }, [filteredEvents, range.first, range.last, timeZone]);
  const printDocument = useMemo(() => printHtml(pages, orientation), [pages, orientation]);
  const previewDocument = useMemo(() => printHtml(pages[page] ? [pages[page]] : [], orientation), [pages, page, orientation]);
  if (!open) return null;
  function print() {
    if (loadingEvents || loadError || (!selectedJobIds.length && !includeCompanyEvents)) return;
    setPrinting(true);
    const frame = document.createElement("iframe"); frame.title = "Master Calendar print document"; frame.style.cssText = "position:fixed;width:1px;height:1px;right:0;bottom:0;border:0;opacity:0";
    frame.onload = () => { window.setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); window.setTimeout(() => { frame.remove(); setPrinting(false); }, 1000); }, 150); };
    document.body.appendChild(frame); frame.srcdoc = printDocument;
  }
  const modes: [Mode, string][] = [["screen", "As shown on screen"], ["week", "This week"], ["two-weeks", "Next 2 weeks"], ["month", "This month"], ["custom", "Custom"]];
  return <div className="calendar-print-dialog fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-labelledby="master-print-title" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#293461] bg-[#111a30] text-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
    <header className="flex items-center justify-between border-b border-slate-700 px-5 py-3"><h2 id="master-print-title" className="text-lg font-bold">Print Master Calendar</h2><button type="button" aria-label="Close print options" onClick={onClose} className="rounded px-2 text-2xl text-slate-300">×</button></header>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]"><div className="space-y-4 overflow-y-auto border-b border-slate-700 p-4 lg:border-b-0 lg:border-r">
      <section><h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">Dates to print</h3><div className="mt-2 flex flex-wrap gap-1.5">{modes.map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} className={`rounded border px-2.5 py-1.5 text-xs font-semibold ${mode === value ? "border-amber-400 bg-amber-500 text-slate-950" : "border-slate-600"}`}>{label}</button>)}</div>{mode === "custom" && <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><label>From<input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} className="mt-1 w-full rounded border border-slate-500 bg-slate-900 px-2 py-2 text-white"/></label><label>To<input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} className="mt-1 w-full rounded border border-slate-500 bg-slate-900 px-2 py-2 text-white"/></label></div>}<p className="mt-2 text-xs text-slate-400">Long date ranges continue on additional pages.</p></section>
      <section><h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">Include</h3><label className="mt-2 flex items-center gap-2 py-1.5 text-sm"><input type="checkbox" checked={includeTasks} onChange={event => setIncludeTasks(event.target.checked)} className="h-4 w-4 accent-amber-500"/>Tasks</label><label className="flex items-center gap-2 py-1.5 text-sm"><input type="checkbox" checked={includeEvents} onChange={event => setIncludeEvents(event.target.checked)} className="h-4 w-4 accent-amber-500"/>Events</label></section>
      <section><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">Jobs to include</h3><div className="flex gap-2 text-xs"><button type="button" onClick={() => { setSelectedJobIds(jobs.map(job => job.id)); setIncludeCompanyEvents(true); setPage(0); }} className="font-bold text-lime-300 underline">Select all</button><button type="button" onClick={() => { setSelectedJobIds([]); setIncludeCompanyEvents(false); setPage(0); }} className="text-lime-300 underline">Clear</button></div></div><div className="mt-2 max-h-48 overflow-y-auto divide-y divide-slate-700 rounded border border-slate-700 px-2"><label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={includeCompanyEvents} onChange={event => { setIncludeCompanyEvents(event.target.checked); setPage(0); }} className="h-4 w-4 accent-amber-500"/>Company-wide events</label>{jobs.map(job => <label key={job.id} className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={selectedJobIds.includes(job.id)} onChange={event => { setSelectedJobIds(current => event.target.checked ? [...current, job.id] : current.filter(id => id !== job.id)); setPage(0); }} className="h-4 w-4 accent-amber-500"/><span className="truncate" title={job.name}>{job.name}{job.status && job.status !== "active" ? ` (${job.status})` : ""}</span></label>)}</div><p className="mt-1 text-xs text-slate-400">Starts with the jobs shown on the calendar. Change the selection to control this print only.</p></section>
      <section><h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">Page</h3><div className="mt-2 flex gap-2">{(["landscape", "portrait"] as const).map(value => <button key={value} type="button" onClick={() => setOrientation(value)} aria-pressed={orientation === value} className={`rounded border px-3 py-1.5 text-xs font-semibold capitalize ${orientation === value ? "border-amber-400 text-amber-300" : "border-slate-600 text-slate-300"}`}>{value}</button>)}</div></section>
      <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3"><strong className="text-sm">{pages.length} {pages.length === 1 ? "page" : "pages"} · {orientation} · Letter</strong><p className="mt-1 text-xs text-slate-400">Colored task and event bars are included.</p>{loadingEvents && <p role="status" className="mt-1 text-xs text-slate-300">Loading selected calendar dates…</p>}{loadError && <p role="alert" className="mt-1 text-xs text-red-300">{loadError}</p>}{!selectedJobIds.length && !includeCompanyEvents && <p className="mt-1 text-xs text-amber-300">Select at least one job or company-wide events to print.</p>}</div>
    </div><div className="flex min-h-[300px] min-w-0 flex-col bg-[#0b1222] p-3 sm:p-5"><div className="flex items-center justify-between pb-2 text-xs text-slate-300"><span>Live print preview</span><span>Page {Math.min(page + 1, pages.length || 1)} of {pages.length || 1}</span></div><iframe title="Master Calendar print preview" srcDoc={previewDocument} className="min-h-0 flex-1 rounded bg-white"/><div className="flex items-center justify-center gap-3 pt-2"><button type="button" disabled={page <= 0} onClick={() => setPage(i => Math.max(0, i - 1))} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40">‹</button><span className="text-xs text-slate-300">Page {Math.min(page + 1, pages.length || 1)} of {pages.length || 1}</span><button type="button" disabled={page >= pages.length - 1} onClick={() => setPage(i => Math.min(pages.length - 1, i + 1))} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40">›</button></div></div></div>
    <footer className="flex justify-end gap-2 border-t border-slate-700 px-5 py-3"><button type="button" onClick={onClose} className="rounded border border-slate-500 px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" disabled={printing || loadingEvents || !!loadError || !pages.length || (!selectedJobIds.length && !includeCompanyEvents)} onClick={print} className="rounded bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">{printing ? "Opening print…" : "Print"}</button></footer>
  </section></div>;
}
