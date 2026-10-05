export const PROJECT_CALENDAR_COLORS = [
  "#3B417D", "#D1850B", "#55681C", "#A9CF38", "#0E123B", "#2e75b6",
  "#9b59b6", "#16a085", "#c0392b", "#7f8c8d", "#34495e", "#e84393",
] as const;

export type ProjectCalendarColor = (typeof PROJECT_CALENDAR_COLORS)[number];

export function isProjectCalendarColor(value: unknown): value is ProjectCalendarColor {
  return typeof value === "string" && PROJECT_CALENDAR_COLORS.includes(value as ProjectCalendarColor);
}
