"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import { useEffect, useMemo, useState } from "react";

export type ExternalPlanTask = { id: number; text: string; start_date: string; end_date: string | null; duration: number; progress: number; parent: number; type: "project" | "task"; is_root: boolean; color?: string };
export type ExternalCalendarItem = { id: string | number; title: string; start: string; end: string; allDay: boolean; color?: string; extendedProps?: { kind?: string; timeZone?: string } };

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function shortDay(day: string) { return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`)); }

export function ExternalProjectPlanView({ tasks, error }: { tasks: ExternalPlanTask[] | null; error: string }) {
  const visible = useMemo(() => (tasks || []).filter(task => !task.is_root), [tasks]);
  const firstDay = visible.map(task => task.start_date).filter(Boolean).sort()[0] || new Date().toISOString().slice(0, 10);
  const [windowStart, setWindowStart] = useState(firstDay);
  useEffect(() => { if (visible.length) setWindowStart(firstDay); }, [firstDay, visible.length]);
  const days = useMemo(() => Array.from({ length: 28 }, (_, index) => addDays(windowStart, index)), [windowStart]);
  const dayWidth = 42;

  return <section aria-label="Read-only Project Plan" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Project Plan</h2><p className="mt-1 text-sm text-slate-600">Approved Tasks only · View only</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => setWindowStart(day => addDays(day, -28))} className="min-h-10 rounded border border-slate-300 px-3 text-sm font-bold" aria-label="Previous 28 days">‹</button><button type="button" onClick={() => setWindowStart(firstDay)} className="min-h-10 rounded border border-slate-300 px-3 text-sm font-bold">First Task</button><button type="button" onClick={() => setWindowStart(day => addDays(day, 28))} className="min-h-10 rounded border border-slate-300 px-3 text-sm font-bold" aria-label="Next 28 days">›</button></div></div>
    {error ? <p role="alert" className="mt-4 text-sm text-red-700">Project Plan is unavailable: {error}</p> : tasks === null ? <p role="status" className="mt-4 text-sm text-slate-600">Loading Project Plan…</p> : !visible.length ? <p className="mt-4 text-sm text-slate-600">No approved Tasks are available for this Project.</p> : <div className="mt-4 overflow-x-auto rounded-lg border border-slate-300"><div style={{ minWidth: 260 + days.length * dayWidth }}><div className="grid border-b border-slate-300 bg-slate-100 text-xs font-bold text-slate-700" style={{ gridTemplateColumns: `260px repeat(${days.length}, ${dayWidth}px)` }}><div className="sticky left-0 z-10 border-r border-slate-300 bg-slate-100 p-2">Task</div>{days.map(day => <div key={day} className="border-r border-slate-300 p-2 text-center">{shortDay(day)}</div>)}</div>{visible.map(task => { const taskStart = task.start_date; const taskEnd = task.end_date || addDays(taskStart, Math.max(1, task.duration || 1) - 1); const first = Math.max(0, days.findIndex(day => day >= taskStart)); const last = days.reduce((index, day, dayIndex) => day <= taskEnd ? dayIndex : index, -1); const showsBar = taskStart <= days[days.length - 1] && taskEnd >= days[0] && last >= first; return <div key={task.id} className="grid min-h-12 border-b border-slate-200 last:border-b-0" style={{ gridTemplateColumns: `260px repeat(${days.length}, ${dayWidth}px)` }}><div className="sticky left-0 z-10 flex flex-col justify-center border-r border-slate-300 bg-white px-3 py-1 text-sm"><strong className="truncate text-slate-900" title={task.text}>{task.text}</strong><span className="text-xs text-slate-600">{shortDay(taskStart)}–{shortDay(taskEnd)} · {Math.round(Math.min(1, Math.max(0, Number(task.progress) || 0)) * 100)}%</span></div>{days.map(day => <div key={day} className="border-r border-slate-200" />)}{showsBar && <div className="relative z-[1] self-center rounded px-2 py-1 text-xs font-bold text-white" style={{ gridColumn: `${first + 2} / ${last + 3}`, gridRow: 1, backgroundColor: task.color || "#3B417D" }} title={`${task.text}: ${shortDay(taskStart)}–${shortDay(taskEnd)}`}>{task.type === "project" ? "Phase" : task.text}</div>}</div>; })}</div></div>}
  </section>;
}

export function ExternalProjectCalendarView({ items, error, timeZone }: { items: ExternalCalendarItem[] | null; error: string; timeZone: string }) {
  return <section aria-label="Read-only Project Calendar" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="text-lg font-bold text-slate-950">Project Calendar</h2><p className="mt-1 text-sm text-slate-600">Approved Tasks and Events for this Project · View only</p>{error ? <p role="alert" className="mt-4 text-sm text-red-700">Project Calendar is unavailable: {error}</p> : items === null ? <p role="status" className="mt-4 text-sm text-slate-600">Loading Project Calendar…</p> : <div className="dialoggg-calendar mt-4"><FullCalendar plugins={[dayGridPlugin, interactionPlugin, luxonPlugin]} initialView="dayGridMonth" headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,dayGridWeek,dayGridDay" }} events={items as any} timeZone={timeZone} editable={false} selectable={false} eventStartEditable={false} eventDurationEditable={false} dayMaxEvents eventDidMount={info => { const event = info.event; info.el.title = `${event.title} · ${event.startStr}${event.endStr ? ` – ${event.endStr}` : ""}`; }} height="auto" /></div>}</section>;
}
