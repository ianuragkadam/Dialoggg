"use client";

import { useEffect, useMemo, useState } from "react";

type PrintResource = { id: string; title: string; category: string };
type PrintEvent = {
  id: string; resourceId: string; title: string; start: string; end: string; color: string; allDay: boolean;
  extendedProps: { resourceName: string; resourceCategory: string; rawTitle: string; projectName: string };
};
type Props = {
  open: boolean; onClose: () => void; view: "timeline" | "calendar"; focusDate: string; shownStart: string; shownEnd: string;
  resources: PrintResource[]; events: PrintEvent[]; categories: string[]; selectedCategories: string[]; selectedResourceIds: string[];
  companyName: string; timeZone: string; preferenceKey: string;
};
type Options = { orientation: "landscape" | "portrait"; showEveryEvent: boolean; inkSaver: boolean };
type DateMode = "screen" | "week" | "two-weeks" | "month" | "custom" | "next-month" | "pick-month";

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const dateAtNoon = (key: string) => new Date(`${key}T12:00:00Z`);
const shiftDate = (key: string, days: number) => { const date = dateAtNoon(key); date.setUTCDate(date.getUTCDate() + days); return dateKey(date); };
const monthKey = (key: string) => key.slice(0, 7);
const monthStart = (key: string) => `${monthKey(key)}-01`;
const nextMonthStart = (key: string) => { const d = dateAtNoon(`${monthKey(key)}-01`); d.setUTCMonth(d.getUTCMonth() + 1); return dateKey(d); };
const monthEnd = (key: string) => shiftDate(nextMonthStart(key), -1);
const fmt = (key: string, timeZone: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) => new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(dateAtNoon(key));
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

const safeColor = (value: string) => /^#[\da-f]{3,8}$/i.test(value) || /^(?:rgb|rgba|hsl|hsla)\([\d.,%\s+-]+\)$/i.test(value) ? value : "#3b417d";
function colorBlock(color: string, content: string) {
  const fill = safeColor(color);
  // SVG foreground paint survives Chromium printing even when Background graphics is off.
  const svg = `<svg class="event-color" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true"><rect width="100%" height="100%" rx="2" fill="${fill}" stroke="none" stroke-width="0"/></svg>`;
  return `<div class="event"><span class="event-paint">${svg}</span><span class="event-label">${content}</span></div>`;
}

function dateDays(start: string, end: string) { const result: string[] = []; for (let key = start; key <= end && result.length < 400; key = shiftDate(key, 1)) result.push(key); return result; }
function localDateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function eventEnd(event: PrintEvent, timeZone: string) {
  if (!event.end) return event.start.slice(0, 10);
  if (event.allDay || /^\d{4}-\d{2}-\d{2}$/.test(event.end)) return shiftDate(event.end.slice(0, 10), -1);
  return localDateKey(new Date(Date.parse(event.end) - 1), timeZone);
}
function inRange(event: PrintEvent, day: string, timeZone: string) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(event.start) ? event.start : localDateKey(new Date(event.start), timeZone);
  return start <= day && eventEnd(event, timeZone) >= day;
}

function calendarPageHtml(args: { dates: string[]; calendarMonth: string; events: PrintEvent[]; showEvery: boolean; company: string; printed: string; timeZone: string; monthLabel: string; pageIndex: number; pageCount: number; inkSaver: boolean }) {
  const startOffset = dateAtNoon(args.dates[0]).getUTCDay();
  const gridStart = shiftDate(args.dates[0], -startOffset);
  const allGridDays = dateDays(gridStart, shiftDate(gridStart, Math.ceil((startOffset + args.dates.length) / 7) * 7 - 1));
  const weeks: string[][] = []; for (let i = 0; i < allGridDays.length; i += 7) weeks.push(allGridDays.slice(i, i + 7));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const body = weeks.map(week => {
    const maxDailyEvents = Math.max(0, ...week.map(day => monthKey(day) === args.calendarMonth ? args.events.filter(event => inRange(event, day, args.timeZone)).length : 0));
    const rowHeight = args.showEvery ? Math.max(1.16, maxDailyEvents * 0.12 + 0.2) : 1.16;
    return `<tr style="height:${rowHeight}in">${week.map(day => {
    const events = monthKey(day) === args.calendarMonth ? args.events.filter(event => inRange(event, day, args.timeZone)).sort((a, b) => a.extendedProps.resourceName.localeCompare(b.extendedProps.resourceName) || a.title.localeCompare(b.title)) : [];
    const visible = args.showEvery ? events : events.slice(0, 3);
    return `<td class="day ${monthKey(day) !== args.calendarMonth ? "outside" : ""}"><div class="daynum">${dateAtNoon(day).getUTCDate()}</div>${visible.map(event => colorBlock(event.color, `<b>${esc(event.extendedProps.resourceName)}</b> · ${esc(event.extendedProps.rawTitle || event.title)}${event.extendedProps.projectName ? ` <small>(${esc(event.extendedProps.projectName)})</small>` : ""}`)).join("")}${!args.showEvery && events.length > 3 ? `<div class="more">+${events.length - 3} more</div>` : ""}</td>`;
  }).join("")}</tr>`;
  }).join("");
  return `<article class="paper ${args.inkSaver ? "ink" : ""}"><header class="paperhead"><div><b>Resource Calendar</b><small>${esc(args.company)}</small></div><div class="right"><b>${esc(args.monthLabel)}</b><small>Printed ${esc(args.printed)}</small></div></header><table class="month"><thead><tr>${weekdays.map(day => `<th>${day}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table><footer><span>dialoggg.com</span><span>Page ${args.pageIndex + 1} of ${args.pageCount}</span></footer></article>`;
}

function timelinePageHtml(args: { dates: string[]; events: PrintEvent[]; resources: PrintResource[]; categories: string[]; company: string; printed: string; timeZone: string; pageIndex: number; pageCount: number; inkSaver: boolean }) {
  const rows = args.categories.flatMap(category => {
    const items = args.resources.filter(resource => resource.category === category).sort((a, b) => a.title.localeCompare(b.title));
    if (!items.length) return [];
    return [`<tr class="group"><th colspan="${args.dates.length + 1}">${esc(category)}</th></tr>`, ...items.map(resource => `<tr><th class="resource">${esc(resource.title)}</th>${args.dates.map(day => {
      const daily = args.events.filter(event => event.resourceId === resource.id && inRange(event, day, args.timeZone));
      return `<td>${daily.map(event => colorBlock(event.color, esc(event.extendedProps.rawTitle || event.title))).join("")}</td>`;
    }).join("")}</tr>`)];
  }).join("");
  return `<article class="paper ${args.inkSaver ? "ink" : ""}"><header class="paperhead"><div><b>Resource Calendar</b><small>${esc(args.company)}</small></div><div class="right"><b>${esc(fmt(args.dates[0], args.timeZone))} – ${esc(fmt(args.dates.at(-1)!, args.timeZone))}</b><small>Printed ${esc(args.printed)}</small></div></header><table class="timeline"><thead><tr><th class="resource">Resources</th>${args.dates.map(day => `<th>${esc(fmt(day, args.timeZone, { weekday: "short", month: "numeric", day: "numeric" }))}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table><footer><span>dialoggg.com</span><span>Page ${args.pageIndex + 1} of ${args.pageCount}</span></footer></article>`;
}

function printHtml(pages: string[], orientation: Options["orientation"]) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Resource Calendar</title><style>
    @page{size:Letter ${orientation};margin:.3in}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}html,body{margin:0;padding:0;background:#e5e7eb;color:#172033;font:9px Arial,sans-serif}.paper{position:relative;width:100%;min-height:7.8in;background:white;padding:.14in .14in .32in;margin:0 auto;break-after:page;page-break-after:always;overflow:hidden}.paper:not(.ink){background:#f1f5f9}.paper:last-child{break-after:auto;page-break-after:auto}.paperhead{display:flex;justify-content:space-between;border-bottom:1px solid #9ca3af;padding-bottom:5px;margin-bottom:7px}.paperhead b{font-size:14px}.paperhead small{display:block;color:#526071;margin-top:3px}.right{text-align:right}.month,.timeline{border-collapse:collapse;width:100%;table-layout:fixed}.month th,.month td,.timeline th,.timeline td{border:1px solid #cbd5e1}.month th{height:19px;background:#11163e;color:white}.month td{height:1.16in;vertical-align:top;padding:2px}.day.outside{background:#f5f5f4;color:#a1a1aa}.daynum{font-size:9px;text-align:right;margin:1px 2px 3px}.event{position:relative;isolation:isolate;display:block;color:white!important;border:0!important;outline:0!important;box-shadow:none!important;border-radius:2px;padding:2px 3px;margin:1px 0;font-size:7px;line-height:1.15;overflow:hidden;min-height:10px}.event-paint{position:absolute;inset:0;z-index:-1;display:block;overflow:hidden;border-radius:2px;border:0;outline:0;box-shadow:none}.event-color{display:block;width:100%;height:100%;min-height:10px;border:0;outline:0;box-shadow:none}.event-color rect{stroke:none!important;stroke-width:0!important}.event-label{position:relative;z-index:1;color:#fff!important;border:0!important;outline:0!important;box-shadow:none!important}.event small{font-size:6px}.more{color:#475569;font-size:7px}.timeline th{background:#f1f5f9;padding:3px 2px}.timeline thead{display:table-header-group}.timeline td{height:26px;vertical-align:middle;padding:1px}.timeline th.resource{width:1.45in;text-align:left}.timeline .group th{text-align:left;background:#e5e7eb;height:16px}.timeline .event{white-space:normal}.paper footer{position:absolute;left:.14in;right:.14in;bottom:.1in;display:flex;justify-content:space-between;color:#64748b;font-size:7px}.ink{background:#fff!important}.ink .month th{background:#fff;color:#111}.ink .timeline th,.ink .timeline .group th{background:#fff;color:#111}.ink .day.outside{background:#fff}.summary{color:#475569}
    @media print{html,body{background:#fff!important}.paper,.paper:not(.ink),.month th,.timeline th,.timeline .group th,.day.outside,.event{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
    @media screen{body{padding:12px;background:#fff}.paper{width:100%;aspect-ratio:${orientation === "landscape" ? "11/8.5" : "8.5/11"};min-height:0;box-shadow:0 2px 12px #0002;margin:0 auto 12px;overflow:auto}.month td{height:auto;min-height:50px}.timeline td{height:26px}}
  </style></head><body>${pages.join("")}</body></html>`;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) { return <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm"><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 accent-amber-500" /></label>; }

export default function ResourceCalendarPrintDialog(props: Props) {
  const [orientation, setOrientation] = useState<Options["orientation"]>("landscape");
  const [showEveryEvent, setShowEveryEvent] = useState(true);
  const [inkSaver, setInkSaver] = useState(false);
  const [dateMode, setDateMode] = useState<DateMode>("screen");
  const [from, setFrom] = useState(props.shownStart);
  const [to, setTo] = useState(shiftDate(props.shownEnd, -1));
  const [month, setMonth] = useState(monthKey(props.focusDate));
  const [previewPage, setPreviewPage] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [typeSelection, setTypeSelection] = useState<string[]>(props.selectedCategories);
  const [resourceSelection, setResourceSelection] = useState<string[]>(props.selectedResourceIds);

  useEffect(() => {
    if (!props.open || !props.preferenceKey) return;
    try {
      const storageKey = `${props.preferenceKey}:print:v2`;
      const versioned = localStorage.getItem(storageKey) !== null;
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? localStorage.getItem(`${props.preferenceKey}:print`) ?? "null") as Partial<Options> | null;
      if (saved) {
        setOrientation(saved.orientation === "portrait" ? "portrait" : "landscape");
        setShowEveryEvent(saved.showEveryEvent !== false);
        // The previous release defaulted Ink saver on, so migrate that implicit setting to full-color output.
        setInkSaver(versioned && saved.inkSaver === true);
      }
    } catch { /* ignore stale preference values */ }
    setDateMode("screen"); setFrom(props.shownStart); setTo(shiftDate(props.shownEnd, -1)); setMonth(monthKey(props.focusDate));
    setTypeSelection(props.selectedCategories); setResourceSelection(props.selectedResourceIds); setPreviewPage(0);
  }, [props.open, props.preferenceKey, props.shownStart, props.shownEnd, props.focusDate, props.selectedCategories, props.selectedResourceIds]);
  useEffect(() => {
    if (props.open && props.preferenceKey) localStorage.setItem(`${props.preferenceKey}:print:v2`, JSON.stringify({ orientation, showEveryEvent, inkSaver } satisfies Options));
  }, [props.open, props.preferenceKey, orientation, showEveryEvent, inkSaver]);

  const visibleCategories = useMemo(() => props.categories.filter(category => typeSelection.includes(category)), [props.categories, typeSelection]);
  const resourceList = useMemo(() => props.resources.filter(resource => visibleCategories.includes(resource.category) && resourceSelection.includes(resource.id)), [props.resources, visibleCategories, resourceSelection]);
  const printEvents = useMemo(() => props.events.filter(event => visibleCategories.includes(event.extendedProps.resourceCategory) && resourceSelection.includes(event.resourceId)), [props.events, visibleCategories, resourceSelection]);
  const range = useMemo(() => {
    if (props.view === "calendar") {
      const start = dateMode === "next-month" ? nextMonthStart(props.focusDate) : dateMode === "pick-month" ? `${month}-01` : monthStart(props.focusDate);
      return { start, end: monthEnd(start), label: fmt(start, props.timeZone, { month: "long", year: "numeric" }) };
    }
    let start = props.shownStart, end = shiftDate(props.shownEnd, -1);
    if (dateMode === "week") { start = shiftDate(props.focusDate, -dateAtNoon(props.focusDate).getUTCDay()); end = shiftDate(start, 6); }
    if (dateMode === "two-weeks") { start = props.focusDate; end = shiftDate(start, 13); }
    if (dateMode === "month") { start = monthStart(props.focusDate); end = monthEnd(start); }
    if (dateMode === "custom") { start = from; end = to; }
    return { start, end, label: `${fmt(start, props.timeZone)} – ${fmt(end, props.timeZone)}` };
  }, [props.view, props.focusDate, props.shownStart, props.shownEnd, props.timeZone, dateMode, from, to, month]);
  const dates = useMemo(() => dateDays(range.start, range.end), [range.start, range.end]);
  const printed = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone: props.timeZone, dateStyle: "medium" }).format(new Date()), [props.timeZone]);
  const categoriesForRows = props.categories.filter(category => visibleCategories.includes(category));
  const pages = useMemo(() => {
    if (!dates.length) return [];
    if (props.view === "timeline") {
      const perPage = orientation === "landscape" ? 14 : 8;
      const rowLimit = orientation === "landscape" ? 22 : 32;
      const resourceGroups = categoriesForRows.map(category => ({ category, rows: resourceList.filter(resource => resource.category === category) })).filter(group => group.rows.length);
      const rowChunks: Array<{ category: string; resource: PrintResource }[]> = [];
      let current: { category: string; resource: PrintResource }[] = [];
      for (const group of resourceGroups) for (const resource of group.rows) { if (current.length >= rowLimit) { rowChunks.push(current); current = []; } current.push({ category: group.category, resource }); }
      if (current.length) rowChunks.push(current); if (!rowChunks.length) rowChunks.push([]);
      const dateSlices: string[][] = []; for (let i = 0; i < dates.length; i += perPage) dateSlices.push(dates.slice(i, i + perPage));
      const count = rowChunks.length * dateSlices.length;
      let pageIndex = 0;
      return dateSlices.flatMap(slice => rowChunks.map(rows => timelinePageHtml({ dates: slice, events: printEvents, resources: rows.map(row => row.resource), categories: [...new Set(rows.map(row => row.category))], company: props.companyName, printed, timeZone: props.timeZone, pageIndex: pageIndex++, pageCount: count, inkSaver })));
    }
    const start = monthStart(range.start); const end = monthEnd(start); const calendarDates = dateDays(start, end);
    const firstDay = dateAtNoon(start).getUTCDay(); const countWeeks = Math.ceil((firstDay + calendarDates.length) / 7);
    const weeks = dateDays(shiftDate(start, -firstDay), shiftDate(start, -firstDay + countWeeks * 7 - 1));
    const weekGroups: string[][][] = []; let currentWeeks: string[][] = []; let currentHeight = 0;
    for (let i = 0; i < countWeeks; i += 1) {
      const week = weeks.slice(i * 7, (i + 1) * 7);
      const maxDailyEvents = Math.max(0, ...week.map(day => monthKey(day) === monthKey(start) ? printEvents.filter(event => inRange(event, day, props.timeZone)).length : 0));
      const height = showEveryEvent ? Math.max(1.16, maxDailyEvents * 0.12 + 0.2) : 1.16;
      if (currentWeeks.length && currentHeight + height > 7) { weekGroups.push(currentWeeks); currentWeeks = []; currentHeight = 0; }
      currentWeeks.push(week); currentHeight += height;
    }
    if (currentWeeks.length) weekGroups.push(currentWeeks);
    const count = Math.max(weekGroups.length, 1);
    return weekGroups.map((weeksForPage, index) => calendarPageHtml({ dates: weeksForPage.flat(), calendarMonth: monthKey(start), events: printEvents, showEvery: showEveryEvent, company: props.companyName, printed, timeZone: props.timeZone, monthLabel: fmt(start, props.timeZone, { month: "long", year: "numeric" }), pageIndex: index, pageCount: count, inkSaver }));
  }, [props.view, props.timeZone, props.companyName, dates, range.start, orientation, categoriesForRows, resourceList, printEvents, printed, inkSaver, showEveryEvent]);
  const documentHtml = useMemo(() => printHtml(pages, orientation), [pages, orientation]);
  const previewHtml = useMemo(() => printHtml(pages[previewPage] ? [pages[previewPage]] : [], orientation), [pages, previewPage, orientation]);
  const summary = `${pages.length || 1} ${pages.length === 1 ? "page" : "pages"} · ${orientation === "landscape" ? "Landscape" : "Portrait"} · Letter · ${range.label}`;

  if (!props.open) return null;
  function toggleCategory(category: string, checked: boolean) {
    setTypeSelection(current => checked ? [...current, category] : current.filter(item => item !== category));
    if (checked) setResourceSelection(current => [...new Set([...current, ...props.resources.filter(resource => resource.category === category).map(resource => resource.id)])]);
    else setResourceSelection(current => current.filter(id => props.resources.find(resource => resource.id === id)?.category !== category));
  }
  function printNow() {
    if (!props.preferenceKey) return;
    localStorage.setItem(`${props.preferenceKey}:print:v2`, JSON.stringify({ orientation, showEveryEvent, inkSaver } satisfies Options));
    setPrinting(true);
    const frame = document.createElement("iframe"); frame.title = "Resource Calendar print document";
    frame.style.cssText = "position:fixed;width:1px;height:1px;right:0;bottom:0;border:0;opacity:0";
    frame.onload = () => { window.setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); window.setTimeout(() => { frame.remove(); setPrinting(false); }, 1000); }, 150); };
    document.body.appendChild(frame); frame.srcdoc = documentHtml;
  }
  const modes: [DateMode, string][] = props.view === "timeline" ? [["screen", "As shown on screen"], ["week", "This week"], ["two-weeks", "Next 2 weeks"], ["month", "This month"], ["custom", "Custom"]] : [["screen", "As shown on screen"], ["next-month", "Next month"], ["pick-month", "Pick"]];
  return <div className="calendar-print-dialog fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6" onMouseDown={props.onClose}><section role="dialog" aria-modal="true" aria-labelledby="resource-print-title" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#293461] bg-[#111a30] text-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
    <header className="flex items-center justify-between border-b border-slate-700 px-5 py-3"><h2 id="resource-print-title" className="text-lg font-bold">Print Resource Calendar</h2><button type="button" aria-label="Close print options" onClick={props.onClose} className="rounded px-2 text-2xl text-slate-300 hover:bg-slate-700">×</button></header>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-4 overflow-y-auto border-b border-slate-700 p-4 lg:border-b-0 lg:border-r">
        <section><h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">{props.view === "calendar" ? "Month to print" : "Dates to print"}</h3><div className="mt-2 flex flex-wrap gap-1.5">{modes.map(([value, label]) => <button key={value} type="button" onClick={() => setDateMode(value)} className={`rounded border px-2.5 py-1.5 text-xs font-semibold ${dateMode === value ? "border-amber-400 bg-amber-500 text-slate-950" : "border-slate-600 hover:bg-slate-700"}`}>{label}</button>)}</div>
          {props.view === "timeline" && dateMode === "custom" && <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><label>From<input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} className="mt-1 w-full rounded border border-slate-500 bg-slate-900 px-2 py-2 text-white"/></label><label>To<input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} className="mt-1 w-full rounded border border-slate-500 bg-slate-900 px-2 py-2 text-white"/></label></div>}
          {props.view === "calendar" && <div className="mt-3 flex items-center justify-between rounded border border-slate-700 p-2"><button aria-label="Previous month" type="button" onClick={() => { const d = dateAtNoon(`${month}-01`); d.setUTCMonth(d.getUTCMonth() - 1); setMonth(monthKey(dateKey(d))); setDateMode("pick-month"); }} className="rounded border border-slate-600 px-2 py-1">‹</button><strong>{fmt(`${month}-01`, props.timeZone, { month: "long", year: "numeric" })}</strong><button aria-label="Next month" type="button" onClick={() => { const d = dateAtNoon(`${month}-01`); d.setUTCMonth(d.getUTCMonth() + 1); setMonth(monthKey(dateKey(d))); setDateMode("pick-month"); }} className="rounded border border-slate-600 px-2 py-1">›</button></div>}
          <p className="mt-2 text-xs text-slate-400">{props.view === "calendar" ? "Prints the whole month, including all seven days of every week." : "Longer ranges continue on additional pages; resource names repeat on each page."}</p>
        </section>
        <section><div className="flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">Resources to include</h3><div className="flex gap-2 text-xs"><button type="button" onClick={() => { setTypeSelection([...props.categories]); setResourceSelection([...props.resources.map(item => item.id)]); }} className="font-bold text-lime-300 underline">Select all</button><button type="button" onClick={() => { setTypeSelection([]); setResourceSelection([]); }} className="text-lime-300 underline">Clear</button></div></div><div className="mt-2 divide-y divide-slate-700">{props.categories.map(category => { const count = props.resources.filter(resource => resource.category === category).length; return <label key={category} className="flex items-center justify-between gap-2 py-1.5 text-sm"><span className="flex items-center gap-2"><input type="checkbox" checked={typeSelection.includes(category)} onChange={event => toggleCategory(category, event.target.checked)} className="h-4 w-4 accent-amber-500"/>{category}</span><span className="text-xs text-slate-400">{count}</span></label>; })}</div><p className="mt-1 text-xs text-slate-400">Starts with the resource types and resources currently shown in the calendar.</p></section>
        <section><h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">Page</h3><div className="mt-2 flex gap-2">{(["landscape", "portrait"] as const).map(value => <button key={value} type="button" onClick={() => setOrientation(value)} aria-pressed={orientation === value} className={`rounded border px-3 py-1.5 text-xs font-semibold capitalize ${orientation === value ? "border-amber-400 text-amber-300" : "border-slate-600 text-slate-300"}`}>{value}</button>)}</div></section>
        {props.view === "calendar" && <Toggle checked={showEveryEvent} onChange={setShowEveryEvent} label="Show every event"/>}
        <Toggle checked={inkSaver} onChange={setInkSaver} label="Ink saver"/>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3"><strong className="text-sm">{summary}</strong><p className="summary mt-1 text-xs">{props.view === "timeline" ? "Resource rows repeat on each date page." : showEveryEvent ? pages.length > 1 ? "Busy weeks continue on another page so every event is listed." : "Every event is listed in its day." : "Busy days show a compact + more count."}</p></div>
      </div>
      <div className="flex min-h-[300px] min-w-0 flex-col bg-[#0b1222] p-3 sm:p-5"><div className="flex items-center justify-between pb-2 text-xs text-slate-300"><span>Live print preview</span><span>Page {Math.min(previewPage + 1, pages.length || 1)} of {pages.length || 1}</span></div><iframe title="Resource Calendar print preview" srcDoc={previewHtml} className="min-h-0 flex-1 rounded bg-white"/><div className="flex items-center justify-center gap-3 pt-2"><button type="button" aria-label="Previous preview page" disabled={previewPage <= 0} onClick={() => setPreviewPage(page => Math.max(0, page - 1))} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40">‹</button><span className="text-xs text-slate-300">Page {Math.min(previewPage + 1, pages.length || 1)} of {pages.length || 1}</span><button type="button" aria-label="Next preview page" disabled={previewPage >= pages.length - 1} onClick={() => setPreviewPage(page => Math.min(pages.length - 1, page + 1))} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40">›</button></div></div>
    </div>
    <footer className="flex justify-end gap-2 border-t border-slate-700 px-5 py-3"><button type="button" onClick={props.onClose} className="rounded border border-slate-500 px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" disabled={printing || !pages.length} onClick={printNow} className="rounded bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">{printing ? "Opening print…" : "Print"}</button></footer>
  </section></div>;
}
