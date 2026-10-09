"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ScheduleEntry = {
  id: string;
  resourceId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  extendedProps: {
    conflict: boolean;
    resourceName: string;
    resourceCategory: string;
    projectName: string;
    rawTitle: string;
    kind: "Task" | "Event";
    timeZone?: string;
  };
};

type ConflictPair = { resourceId: string; resourceName: string; resourceCategory: string; first: ScheduleEntry; second: ScheduleEntry; overlapStart: number; overlapEnd: number };

export default function ResourceConflictsReport({ timeZone }: { timeZone: string }) {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/resources/schedule", { cache: "no-store" })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "The schedule conflicts could not be loaded.");
        return payload;
      })
      .then(payload => { if (!cancelled) setEntries(Array.isArray(payload.events) ? payload.events : []); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "The schedule conflicts could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const conflicts = useMemo(() => {
    const groups = new Map<string, ScheduleEntry[]>();
    for (const entry of entries) {
      if (!entry.extendedProps?.conflict) continue;
      groups.set(entry.resourceId, [...(groups.get(entry.resourceId) ?? []), entry]);
    }
    const pairs: ConflictPair[] = [];
    for (const [resourceId, resourceEntries] of groups) {
      const ordered = [...resourceEntries].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      for (let left = 0; left < ordered.length; left += 1) {
        for (let right = left + 1; right < ordered.length; right += 1) {
          const overlapStart = Math.max(Date.parse(ordered[left].start), Date.parse(ordered[right].start));
          const overlapEnd = Math.min(Date.parse(ordered[left].end), Date.parse(ordered[right].end));
          if (overlapStart >= overlapEnd) continue;
          pairs.push({ resourceId, resourceName: ordered[left].extendedProps.resourceName, resourceCategory: ordered[left].extendedProps.resourceCategory, first: ordered[left], second: ordered[right], overlapStart, overlapEnd });
        }
      }
    }
    return pairs.sort((a, b) => a.overlapStart - b.overlapStart || a.resourceName.localeCompare(b.resourceName));
  }, [entries]);

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium" }), [timeZone]);
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }), [timeZone]);
  const formatSchedule = (entry: ScheduleEntry) => {
    const start = new Date(entry.start);
    const lastInstant = new Date(Date.parse(entry.end) - 1);
    const startDate = dateFormatter.format(start);
    const endDate = dateFormatter.format(lastInstant);
    if (entry.allDay) return `${startDate}${startDate !== endDate ? ` – ${endDate}` : ""} · All day`;
    return `${startDate} · ${timeFormatter.format(start)}–${timeFormatter.format(new Date(entry.end))}`;
  };

  if (loading) return <div role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">Loading schedule conflicts…</div>;
  if (error) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800">{error}</div>;

  return <section aria-labelledby="schedule-conflicts-title" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
      <div><h2 id="schedule-conflicts-title" className="text-xl font-bold text-slate-950">{conflicts.length} overlap{conflicts.length === 1 ? "" : "s"} found</h2><p className="mt-1 text-sm text-slate-600">Each row is a pair of assignments that overlap on one Resource.</p></div>
      <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">{new Set(conflicts.map(item => item.resourceId)).size} Resource{new Set(conflicts.map(item => item.resourceId)).size === 1 ? "" : "s"} affected</span>
    </div>
    {!conflicts.length ? <div className="p-10 text-center"><h3 className="font-bold text-slate-950">No scheduling conflicts</h3><p className="mt-1 text-sm text-slate-600">There are no overlapping active Tasks or Events assigned to the same Resource.</p></div> : <div className="divide-y divide-slate-200">{conflicts.map((conflict, index) => <article key={`${conflict.resourceId}-${conflict.first.id}-${conflict.second.id}`} className="p-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-lg font-bold text-slate-950">{conflict.resourceName}</h3><p className="mt-1 text-sm text-slate-500">{conflict.resourceCategory} · Conflict {index + 1}</p></div><p className="w-fit rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">Overlap: {dateFormatter.format(new Date(conflict.overlapStart))}{conflict.first.allDay && conflict.second.allDay ? " · All day" : ` · ${timeFormatter.format(new Date(conflict.overlapStart))}–${timeFormatter.format(new Date(conflict.overlapEnd))}`}</p></div>
      <div className="mt-4 space-y-3">{[conflict.first, conflict.second].map((entry, assignmentIndex) => <div key={`${entry.id}-${assignmentIndex}`} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start"><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700">{entry.extendedProps.kind}</span><span className="text-xs font-semibold text-slate-500">Assignment {assignmentIndex + 1}</span></div><div className="min-w-0"><h4 className="font-bold text-slate-900">{entry.extendedProps.rawTitle}</h4><p className="mt-1 text-sm text-slate-600">{entry.extendedProps.projectName}</p><p className="mt-2 text-sm font-medium text-slate-700">{formatSchedule(entry)}</p></div></div>)}</div>
    </article>)}</div>}
    <div className="border-t border-slate-200 p-4"><Link href="/resources/schedule" className="text-sm font-bold text-blue-700 hover:underline">Review on Resource Calendar →</Link></div>
  </section>;
}
