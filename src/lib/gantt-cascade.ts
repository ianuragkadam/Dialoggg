// Cascade & header-reconciliation logic for the Gantt chart.
// Pure functions over the DB — caller wraps in a transaction.

import db from "@/db";
import { addDays, daysBetween, maxIso, minIso } from "@/lib/dates";

type Task = {
  id: number; project_id: number; parent_id: number | null;
  name: string; start_date: string; duration: number;
  is_header: number; progress: number; color: string;
};
type Link = {
  id: number; project_id: number; source_task_id: number;
  target_task_id: number; link_type: string; lag_days: number;
};

function endOf(t: Task): string {
  return addDays(t.start_date, t.duration);
}

export function cascadeFrom(taskId: number): void {
  const visited = new Set<number>();
  const queue: number[] = [taskId];

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const source = db.prepare("SELECT * FROM task WHERE id = ?").get(id) as Task | undefined;
    if (!source) continue;

    const links = db.prepare(
      "SELECT * FROM task_link WHERE source_task_id = ?",
    ).all(id) as Link[];

    for (const link of links) {
      const target = db.prepare("SELECT * FROM task WHERE id = ?").get(link.target_task_id) as Task | undefined;
      if (!target) continue;

      let newStart = target.start_date;
      const sStart = source.start_date;
      const sEnd = endOf(source);

      switch (link.link_type) {
        case "fs": newStart = addDays(sEnd, link.lag_days); break;
        case "ss": newStart = addDays(sStart, link.lag_days); break;
        case "ff": newStart = addDays(sEnd, link.lag_days - target.duration); break;
        case "sf": newStart = addDays(sStart, link.lag_days - target.duration); break;
      }

      // Only push successor forward (never backward — keeps the schedule stable)
      if (newStart > target.start_date) {
        db.prepare("UPDATE task SET start_date = ? WHERE id = ?").run(newStart, target.id);
        queue.push(target.id);
        if (target.parent_id) reconcileHeader(target.parent_id);
      }
    }
  }
}

export function reconcileHeader(headerId: number): void {
  const subs = db.prepare("SELECT * FROM task WHERE parent_id = ?").all(headerId) as Task[];
  if (!subs.length) return;

  const startsAll = subs.map(s => s.start_date);
  const endsAll = subs.map(s => endOf(s));
  const start = minIso(...startsAll);
  const end = maxIso(...endsAll);
  const dur = Math.max(1, daysBetween(start, end));

  db.prepare("UPDATE task SET start_date = ?, duration = ?, is_header = 1 WHERE id = ?")
    .run(start, dur, headerId);

  // bubble up
  const header = db.prepare("SELECT parent_id FROM task WHERE id = ?").get(headerId) as { parent_id: number | null } | undefined;
  if (header?.parent_id) reconcileHeader(header.parent_id);
}

export function wouldCreateCycle(sourceId: number, targetId: number): boolean {
  if (sourceId === targetId) return true;
  const visited = new Set<number>();
  const queue: number[] = [targetId];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === sourceId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const outs = db.prepare(
      "SELECT target_task_id FROM task_link WHERE source_task_id = ?",
    ).all(id) as { target_task_id: number }[];
    for (const o of outs) queue.push(o.target_task_id);
  }
  return false;
}
