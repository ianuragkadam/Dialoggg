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
