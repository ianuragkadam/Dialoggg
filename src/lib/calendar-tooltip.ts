type CalendarTooltipEvent = {
  title: string;
  startStr: string;
  endStr?: string;
  allDay: boolean;
};

function calendarDateLabel(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  return new Intl.DateTimeFormat("en-US", {
    ...(dateOnly ? { timeZone: "UTC" } : {}),
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(!dateOnly ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

export function calendarEventTooltip(event: CalendarTooltipEvent, projectName?: string) {
  const lines = [event.title];
  if (projectName && !event.title.includes(`(${projectName})`)) lines.push(`Project: ${projectName}`);

  if (event.startStr) {
    let end = event.endStr;
    if (event.allDay && end && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
      const inclusiveEnd = new Date(`${end}T12:00:00Z`);
      inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1);
      end = inclusiveEnd.toISOString().slice(0, 10);
    }
    const startLabel = calendarDateLabel(event.startStr);
    const endLabel = end ? calendarDateLabel(end) : "";
    lines.push(`When: ${startLabel}${endLabel && endLabel !== startLabel ? ` – ${endLabel}` : ""}${event.allDay ? " (all day)" : ""}`);
  }

  return lines.join("\n");
}
