// Pure date utilities — no time-of-day, just YYYY-MM-DD strings.

export function toISO(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${dy}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** DHTMLX Gantt stores the first instant after the final occupied day as end_date. */
export function ganttEndDateFromInclusive(iso: string): string {
  return addDays(iso, 1);
}

export function daysBetween(a: string, b: string): number {
  const ms = parseISO(b).getTime() - parseISO(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function maxIso(...isos: string[]): string {
  return isos.reduce((acc, x) => (x > acc ? x : acc));
}

export function minIso(...isos: string[]): string {
  return isos.reduce((acc, x) => (x < acc ? x : acc));
}

export function todayIso(): string {
  return toISO(new Date());
}

export type WorkingDayRules = {
  allowSaturday: boolean;
  allowSunday: boolean;
};

export function isWorkingDay(iso: string, rules: WorkingDayRules) {
  const day = parseISO(iso).getDay();
  if (day === 6) return rules.allowSaturday;
  if (day === 0) return rules.allowSunday;
  return true;
}

export function alignWorkingDay(iso: string, rules: WorkingDayRules, direction: 1 | -1 = 1) {
  let value = iso;
  while (!isWorkingDay(value, rules)) value = addDays(value, direction);
  return value;
}

export function addWorkingDays(iso: string, workdays: number, rules: WorkingDayRules) {
  if (!Number.isInteger(workdays)) throw new Error("Working-day offset must be an integer.");
  let value = alignWorkingDay(iso, rules, workdays < 0 ? -1 : 1);
  const direction: 1 | -1 = workdays < 0 ? -1 : 1;
  let remaining = Math.abs(workdays);
  while (remaining > 0) {
    value = addDays(value, direction);
    if (isWorkingDay(value, rules)) remaining -= 1;
  }
  return value;
}

export function workingDayOffset(anchor: string, target: string, rules: WorkingDayRules) {
  const alignedAnchor = alignWorkingDay(anchor, rules, 1);
  if (!isWorkingDay(target, rules)) throw new Error("Task starts on an excluded weekend day.");
  const alignedTarget = target;
  if (alignedTarget < alignedAnchor) throw new Error("Task starts before the Project Start Date.");
  let value = alignedAnchor;
  let offset = 0;
  while (value < alignedTarget) {
    value = addWorkingDays(value, 1, rules);
    offset += 1;
  }
  if (value !== alignedTarget) throw new Error("Task Start Date could not be represented as a working-day offset.");
  return offset;
}

/** Lag that preserves an already scheduled target when a new dependency is added. */
export function suggestedDependencyLag(
  sourceStart: string,
  sourceEnd: string,
  targetStart: string,
  targetEnd: string,
  linkType: "fs" | "ss" | "ff" | "sf",
  rules: WorkingDayRules,
) {
  const sourcePoint = linkType === "fs" || linkType === "ff" ? sourceEnd : sourceStart;
  const anchor = alignWorkingDay(linkType === "fs" ? addDays(sourcePoint, 1) : sourcePoint, rules, 1);
  const targetPoint = linkType === "ff" || linkType === "sf" ? targetEnd : targetStart;
  return targetPoint <= anchor ? 0 : workingDayOffset(anchor, targetPoint, rules);
}

export function workingDayEnd(start: string, duration: number, rules: WorkingDayRules) {
  if (!Number.isInteger(duration) || duration < 1) throw new Error("Duration must be at least one working day.");
  return addWorkingDays(start, duration - 1, rules);
}

/** A working day contributes only after its local calendar date has ended. */
export function autoCompletionProgress(start: string, duration: number, rules: WorkingDayRules, today = todayIso()): number {
  if (duration < 1 || !Number.isInteger(duration)) return 0;
  let completed = 0;
  let day = alignWorkingDay(start, rules, 1);
  for (let index = 0; index < duration; index += 1) {
    if (day < today) completed += 1;
    else break;
    day = addWorkingDays(day, 1, rules);
  }
  return completed / duration;
}

export function startForWorkingDayEnd(end: string, duration: number, rules: WorkingDayRules) {
  const alignedEnd = alignWorkingDay(end, rules, 1);
  return addWorkingDays(alignedEnd, -(duration - 1), rules);
}
