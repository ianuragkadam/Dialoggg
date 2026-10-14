"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";
import { addDays, alignWorkingDay, ganttEndDateFromInclusive, suggestedDependencyLag } from "@/lib/dates";
import { PROJECT_CALENDAR_COLORS } from "@/lib/project-colors";
import ColorSwatches from "@/components/ColorSwatches";

declare global {
  interface Window { gantt: any; }
}

type Category = { id: number; name: string };
type Resource = { id: number; name: string; category: string | null; category_id: number | null };

type TaskModal = {
  mode: "add" | "edit";
  id: any;
  text: string;
  start_date: string;     // YYYY-MM-DD
  duration: number;
  color: string;
  parent: any;
  resourceIds: number[];
  version: number;
  isHeader: boolean;
  isRoot: boolean;
  allowSaturday: boolean;
  allowSunday: boolean;
  progress: number;
  categoryId: number | null;
  externalVisible: boolean;
  isTemp: boolean;        // true while a freshly-created task hasn't been saved
};

type LinkModal = {
  sourceId: any;
  targetId: any;
  sourceName: string;
  targetName: string;
  linkType: "fs" | "ss" | "ff" | "sf";
  lag: number;
  suggestedLag: Record<"fs" | "ss" | "ff" | "sf", number>;
};
type GanttScale = "day" | "week" | "month";

function ganttScales(scale: GanttScale, zoom: number) {
  const base = scale === "day" ? 40 : scale === "week" ? 72 : 96;
  const columnWidth = Math.max(12, Math.round(base * zoom / 100));
  if (scale === "week") return [
    { unit: "month", step: 1, format: "%F %Y" },
    { unit: "week", step: 1, format: "Week %W", column_width: columnWidth },
  ];
  if (scale === "month") return [
    { unit: "year", step: 1, format: "%Y" },
    { unit: "month", step: 1, format: "%M", column_width: columnWidth },
  ];
  return [
    { unit: "month", step: 1, format: "%F %Y" },
    { unit: "day", step: 1, format: "%j", column_width: columnWidth },
  ];
}

function addScaleUnits(value: Date, amount: number, scale: GanttScale) {
  const result = new Date(value);
  if (scale === "day") result.setDate(result.getDate() + amount);
  else if (scale === "week") result.setDate(result.getDate() + amount * 7);
  else result.setMonth(result.getMonth() + amount);
  return result;
}

function scaleStart(value: Date, scale: GanttScale) {
  const result = new Date(value);
  result.setHours(12, 0, 0, 0);
  if (scale === "week") result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  if (scale === "month") result.setDate(1);
  return result;
}

function ensureTimelineFillsViewport(gantt: any, tasks: any[], scale: GanttScale, zoom: number, container: HTMLElement | null) {
  const dates = tasks.flatMap(task => [task.start_date, task.end_date])
    .map(value => typeof value === "string" ? value.slice(0, 10) : "")
    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  if (!dates.length) return;

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const earliestTask = new Date(`${dates[0]}T12:00:00`);
  const latestTask = new Date(`${dates[dates.length - 1]}T12:00:00`);
  const firstRelevantDate = earliestTask < today ? earliestTask : today;
  const start = addScaleUnits(scaleStart(firstRelevantDate, scale), -1, scale);
  const baseWidth = scale === "day" ? 40 : scale === "week" ? 72 : 96;
  const columnWidth = Math.max(12, Math.round(baseWidth * zoom / 100));
  const gridWidth = container?.querySelector<HTMLElement>(".gantt_grid")?.getBoundingClientRect().width || 0;
  const timelineWidth = Math.max(180, (container?.clientWidth || 1200) - gridWidth - 24);
  const unitsToFill = Math.ceil(timelineWidth / columnWidth);
  const labelPadding = Math.ceil(200 / columnWidth);
  const taskEnd = new Date(`${dates[dates.length - 1]}T12:00:00`);
  const paddedTaskEnd = addScaleUnits(taskEnd, labelPadding + 2, scale);
  const viewportEnd = addScaleUnits(start, unitsToFill, scale);

  gantt.config.start_date = start;
  gantt.config.end_date = paddedTaskEnd > viewportEnd ? paddedTaskEnd : viewportEnd;
}

const GANTT_COLUMN_WIDTHS = {
  text: { width: 258, min: 150, max: 520 },
  resources: { width: 128, min: 88, max: 360 },
  progress: { width: 64, min: 52, max: 120 },
} as const;

function getColumnWidthBounds(column: { name: string; width?: number; min_width?: number; max_width?: number }) {
  const known = GANTT_COLUMN_WIDTHS[column.name as keyof typeof GANTT_COLUMN_WIDTHS];
  return {
    width: known?.width ?? (Number(column.width) || 140),
    min: known?.min ?? (Number(column.min_width) || 76),
    max: known?.max ?? (Number(column.max_width) || 480),
  };
}

function readGanttColumnWidths(storageKey: string): Record<string, number> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    if (saved && typeof saved === "object") return Object.fromEntries(
      Object.entries(saved).filter(([, width]) => Number.isFinite(Number(width)) && Number(width) > 0)
        .map(([name, width]) => [name, Number(width)]),
    );
  } catch {
    // Use defaults when browser storage is unavailable or contains invalid data.
  }
  return {};
}

function readGanttViewSettings(storageKey: string) {
  const fallback = { scale: "day" as GanttScale, zoom: 100, compact: false, gridCollapsed: false, gridWidth: 43 };
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    if (!saved || typeof saved !== "object") return fallback;
    return {
      scale: (["day", "week", "month"].includes(saved.scale) ? saved.scale : fallback.scale) as GanttScale,
      zoom: Math.max(25, Math.min(100, Math.round(Number(saved.zoom) || 100))),
      compact: saved.compact === true,
      gridCollapsed: saved.gridCollapsed === true,
      gridWidth: Math.max(25, Math.min(65, Math.round(Number(saved.gridWidth) || 43))),
    };
  } catch { return fallback; }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

function chartColor(value: unknown): string {
  return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : PROJECT_CALENDAR_COLORS[0];
}

function progressTint(color: string): string {
  // Keep the task's own color visible as the full bar track; use a lighter tint only for completed progress.
  const channels = [1, 3, 5].map(offset => Math.round(parseInt(color.slice(offset, offset + 2), 16) * .55 + 255 * .45));
  return `rgb(${channels.join(",")})`;
}

const LINK_TYPE_TO_DHTMLX: Record<string, string> = { fs: "0", ss: "1", ff: "2", sf: "3" };

const LINK_OPTIONS: { value: LinkModal["linkType"]; title: string; plain: string }[] = [
  { value: "fs", title: "Finish → Start", plain: "Start this task WHEN the other task FINISHES (most common)" },
  { value: "ss", title: "Start → Start",  plain: "Start this task WHEN the other task STARTS (run them together)" },
  { value: "ff", title: "Finish → Finish",plain: "Finish this task WHEN the other task FINISHES" },
  { value: "sf", title: "Start → Finish", plain: "Finish this task WHEN the other task STARTS (rare)" },
];

// DHTMLX exposes a shared singleton, so only the most recently mounted chart may parse data into it.
let activeGanttChartOwner: symbol | null = null;

function isoFromDate(gantt: any, d: Date): string {
  return gantt.date.date_to_str("%Y-%m-%d")(d);
}

function workingDuration(start: Date, endExclusive: Date, allowSaturday: boolean, allowSunday: boolean) {
  const cursor = new Date(start);
  let count = 0;
  while (cursor < endExclusive) {
    const day = cursor.getDay();
    if ((day !== 6 || allowSaturday) && (day !== 0 || allowSunday)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(1, count);
}

function isPlanVersionConflict(payload: any) {
  return payload?.error?.code === "PLAN_VERSION_CONFLICT";
}

export default function GanttChart({ projectId, projectName, userId, canEdit = true, fullScreen = false }: { projectId: number; projectName: string; userId: number; canEdit?: boolean; fullScreen?: boolean }) {
  const chartShellRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<any>(null);
  const ganttChartOwnerRef = useRef(Symbol("gantt-chart"));
  const syncingRef = useRef(false);
  const planVersionRef = useRef(1);
  const stalePlanRef = useRef(false);
  const planSyncChannelRef = useRef<BroadcastChannel | null>(null);
  const planSyncStorageKey = `dialoggg:project-plan-updated:v1:${projectId}`;
  const tabIdRef = useRef<string>(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const initialViewSettings = readGanttViewSettings(`dialoggg:gantt-view:v1:${userId}:${projectId}`);
  const viewSettingsRef = useRef(initialViewSettings);
  const staleCheckInFlightRef = useRef(false);
  const allColumnsRef = useRef<any[]>([]);
  const fullScreenRef = useRef(fullScreen);
  fullScreenRef.current = fullScreen;
  const projectColorRef = useRef<string>(PROJECT_CALENDAR_COLORS[0]);
  const dragModeRef = useRef<string | null>(null);
  const reorderInFlightRef = useRef(false);
  const columnWidthStorageKey = `dialoggg:gantt-column-widths:v1:${userId}:${projectId}:${canEdit ? "edit" : "view"}`;
  const preferenceStorageKey = `dialoggg:gantt-view:v1:${userId}:${projectId}`;

  const [ready, setReady] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [taskModal, setTaskModal] = useState<TaskModal | null>(null);
  const [linkModal, setLinkModal] = useState<LinkModal | null>(null);
  const [message, setMessage] = useState("");
  const [stalePlan, setStalePlan] = useState(false);
  const [scale, setScale] = useState<GanttScale>(initialViewSettings.scale);
  const [zoom, setZoom] = useState(initialViewSettings.zoom);
  const [compact, setCompact] = useState(initialViewSettings.compact);
  const [gridCollapsed, setGridCollapsed] = useState(initialViewSettings.gridCollapsed);
  const [gridWidth, setGridWidth] = useState(initialViewSettings.gridWidth);
  const [gridDividerLeft, setGridDividerLeft] = useState<number | null>(null);
  const [availablePanelHeight, setAvailablePanelHeight] = useState<number | null>(null);
  const [planTasks, setPlanTasks] = useState<any[]>([]);
  const planTasksRef = useRef<any[]>([]);
  stalePlanRef.current = stalePlan;

  const markPlanStale = useCallback(() => {
    stalePlanRef.current = true;
    setStalePlan(true);
  }, []);

  const announcePlanChanged = useCallback(() => {
    const message = { type: "plan-updated", projectId, sourceTab: tabIdRef.current, changedAt: Date.now() };
    try { planSyncChannelRef.current?.postMessage(message); } catch {}
    try { window.localStorage.setItem(planSyncStorageKey, JSON.stringify(message)); } catch {}
  }, [projectId, planSyncStorageKey]);

  useEffect(() => {
    const receiveUpdate = (message: any) => {
      if (message?.type === "plan-updated" && Number(message.projectId) === projectId && message.sourceTab !== tabIdRef.current) markPlanStale();
    };
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(`dialoggg:project-plan:v1:${projectId}`);
      channel.onmessage = event => receiveUpdate(event.data);
      planSyncChannelRef.current = channel;
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== planSyncStorageKey || !event.newValue) return;
      try { receiveUpdate(JSON.parse(event.newValue)); } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
      if (planSyncChannelRef.current === channel) planSyncChannelRef.current = null;
    };
  }, [markPlanStale, planSyncStorageKey, projectId]);

  useEffect(() => {
    if (fullScreen) return;
    const shell = chartShellRef.current;
    if (!shell) return;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = shell.getBoundingClientRect().top;
        setAvailablePanelHeight(Math.max(380, Math.floor(window.innerHeight - Math.max(0, top) - 12)));
      });
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const observer = new ResizeObserver(measure);
    if (shell.parentElement) observer.observe(shell.parentElement);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      observer.disconnect();
    };
  }, [fullScreen]);

  const measureGridDivider = useCallback(() => {
    const container = containerRef.current;
    const grid = container?.querySelector<HTMLElement>(".gantt_grid");
    if (!container || !grid) return;
    const containerBounds = container.getBoundingClientRect();
    const gridBounds = grid.getBoundingClientRect();
    // Center the 22px toggle on the actual grid/timeline boundary, not a
    // percentage estimate (the grid can be narrower than its requested width).
    setGridDividerLeft(Math.round(gridBounds.right - containerBounds.left - 11));
  }, []);

  // ---- server reload (suppresses sync events while parsing) ----
  const reload = useCallback(async () => {
    const gantt = ganttRef.current;
    const response = await fetch(`/api/projects/${projectId}/tasks`, { cache: "no-store" });
    const data = await response.json();
    if (activeGanttChartOwner !== ganttChartOwnerRef.current) return;
    if (!response.ok) throw new Error(data?.error?.message || "The Project Plan could not be loaded.");
    planVersionRef.current = Number(data.planVersion) || 1;
    projectColorRef.current = chartColor(data.projectColor);
    planTasksRef.current = data.data || [];
    setPlanTasks(planTasksRef.current);
    syncingRef.current = true;
    try {
      gantt.clearAll();
      gantt.parse({
        ...data,
        data: (data.data || []).map((task: any) => ({
          ...task,
          // The API stores inclusive finish dates; DHTMLX expects end_date to be exclusive.
          end_date: ganttEndDateFromInclusive(String(task.end_date).slice(0, 10)),
          working_duration: task.duration, plan_color: chartColor(task.color),
          color: task.type === "project" ? "#0E123B" : chartColor(task.color),
          progressColor: task.type === "project" ? "#0E123B" : progressTint(chartColor(task.color)),
          textColor: "#1c2233",
        })),
      });
    } finally {
      setTimeout(() => { syncingRef.current = false; }, 50);
    }
    window.dispatchEvent(new CustomEvent("dialoggg:project-plan-updated", { detail: { projectId } }));
  }, [projectId]);

  useEffect(() => {
    const settings = { scale, zoom, compact, gridCollapsed, gridWidth };
    viewSettingsRef.current = settings;
    try { window.localStorage.setItem(preferenceStorageKey, JSON.stringify(settings)); } catch {}
    const gantt = ganttRef.current;
    if (!gantt) return;
    gantt.config.scales = ganttScales(scale, zoom);
    gantt.config.row_height = compact ? 32 : 50;
    gantt.config.bar_height = compact ? 18 : 24;
    ensureTimelineFillsViewport(gantt, planTasks, scale, zoom, containerRef.current);
    gantt.config.columns = fullScreen || gridCollapsed ? [allColumnsRef.current[0]].filter(Boolean) : allColumnsRef.current;
    const gridColumn = gantt.config.layout?.rows?.[0]?.cols?.[0];
    if (gridColumn) gridColumn.width = fullScreen || gridCollapsed ? 210 : Math.floor((containerRef.current?.clientWidth || 1200) * gridWidth / 100);
    try {
      gantt.resetLayout();
      gantt.render();
      requestAnimationFrame(measureGridDivider);
    } catch {}
  }, [scale, zoom, compact, gridCollapsed, gridWidth, fullScreen, preferenceStorageKey, planTasks, measureGridDivider]);

  useEffect(() => {
    const checkForNewerPlan = async () => {
      if (staleCheckInFlightRef.current || stalePlan || document.visibilityState === "hidden") return;
      staleCheckInFlightRef.current = true;
      try {
        const response = await fetch(`/api/projects/${projectId}/tasks`, { cache: "no-store" });
        if (!response.ok) return;
        const latest = await response.json();
        if (Number(latest.planVersion) > planVersionRef.current) markPlanStale();
      } catch { /* Focus checks are quiet; the normal chart remains available offline. */ }
      finally { staleCheckInFlightRef.current = false; }
    };
    window.addEventListener("focus", checkForNewerPlan);
    document.addEventListener("visibilitychange", checkForNewerPlan);
    return () => { window.removeEventListener("focus", checkForNewerPlan); document.removeEventListener("visibilitychange", checkForNewerPlan); };
  }, [markPlanStale, projectId, stalePlan]);

  // ---- load resources for the task popup ----
  useEffect(() => {
    fetch("/api/resources").then(r => r.json()).then(j => {
      setCategories(j.categories || []);
      setResources(j.resources || []);
    });
  }, []);

  // ---- init gantt ----
  useEffect(() => {
    let cancelled = false;
    let removeResizeListener: (() => void) | null = null;
    let stopActiveResize: (() => void) | null = null;
    const chartOwner = ganttChartOwnerRef.current;
    const ganttEventIds: string[] = [];
    activeGanttChartOwner = chartOwner;
    let pendingPlanTaskId: number | null = null;
    let openPlanTaskEditor: ((taskId: number) => void) | null = null;
    const openPlanTaskHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: number; taskId?: number }>).detail;
      if (detail?.projectId !== projectId || !detail.taskId) return;
      if (!openPlanTaskEditor) { pendingPlanTaskId = detail.taskId; return; }
      openPlanTaskEditor(detail.taskId);
    };
    window.addEventListener("dialoggg:open-plan-task", openPlanTaskHandler);

  async function init() {
      const cssId = "dhtmlx-gantt-css";
      if (!document.getElementById(cssId)) {
        const link = document.createElement("link");
        link.id = cssId; link.rel = "stylesheet";
        link.href = "/dhtmlx-gantt/dhtmlxgantt.css";
        document.head.appendChild(link);
      }
      const mod: any = await import("dhtmlx-gantt");
      if (cancelled) return;
      const gantt = mod.gantt;
      ganttRef.current = gantt;
      const attachGanttEvent = (name: string, handler: (...args: any[]) => any) => {
        const eventId = gantt.attachEvent(name, handler);
        if (eventId) ganttEventIds.push(eventId);
        return eventId;
      };

      gantt.config.date_format = "%Y-%m-%d";
      gantt.config.duration_unit = "day";
      gantt.config.scale_height = 52;
      gantt.config.row_height = viewSettingsRef.current.compact ? 32 : 50;
      gantt.config.bar_height = viewSettingsRef.current.compact ? 18 : 24;
      gantt.config.autosize = false;
      gantt.config.fit_tasks = false;
      gantt.config.auto_scheduling = true;
      gantt.config.auto_scheduling_strict = true;
      gantt.config.auto_scheduling_initial = true;
      gantt.config.details_on_create = false;   // we open our own popup
      gantt.config.readonly = !canEdit || stalePlanRef.current; // stale tabs stay read-only until refreshed
      gantt.config.order_branch = canEdit;       // allow Owner/Admin to reorder sibling rows by dragging
      gantt.config.order_branch_free = false;    // keep Tasks inside their existing Header

      const columnWidths = readGanttColumnWidths(columnWidthStorageKey);
      const addColumnWidth = 40;

      gantt.config.columns = [
        { name: "text", label: "Task Name", tree: true, width: columnWidths.text,
          template: (task: any) => `${task.type === "project" ? `<i class="plan-group-dot" style="background:${chartColor(task.plan_color)}"></i>` : ""}${canEdit && !task.is_root ? `<span class="gantt-reorder-grip" aria-hidden="true" title="Drag row to reorder">⠿</span>` : ""}${escapeHtml(task.text)}` },
        { name: "resources", label: "Resources", width: columnWidths.resources,
          template: (task: any) => `<span title="${escapeHtml((task.resource_names || []).join(", "))}">${escapeHtml((task.resource_names || []).join(", ")) || "—"}</span>` },
        { name: "progress", label: "Done", align: "right", width: columnWidths.progress,
          template: (task: any) => `${Math.round(Math.max(0, Math.min(1, Number(task.progress) || 0)) * 100)}${task.type === "project" ? "%" : ""}` },
        ...(canEdit ? [{ name: "add", label: "", width: addColumnWidth }] : []),
      ];
      allColumnsRef.current = gantt.config.columns;
      if (fullScreenRef.current || viewSettingsRef.current.gridCollapsed) gantt.config.columns = [gantt.config.columns[0]];
      for (const column of gantt.config.columns) {
        if (column.name === "add") continue;
        const bounds = getColumnWidthBounds(column);
        const savedWidth = Number(columnWidths[column.name]);
        column.width = Number.isFinite(savedWidth)
          ? Math.max(bounds.min, Math.min(bounds.max, Math.round(savedWidth)))
          : bounds.width;
        column.min_width = bounds.min;
        column.max_width = bounds.max;
      }
      const getGridContentWidth = () => gantt.config.columns.reduce(
        (total: number, column: any) => total + Number(column.width || 0), 0,
      );
      const getGridViewportWidth = () => {
        const availableWidth = containerRef.current?.clientWidth || 1200;
        const keepChartVisibleWidth = Math.max(220, availableWidth - 320);
        const requestedWidth = fullScreenRef.current || viewSettingsRef.current.gridCollapsed ? 210 : Math.floor(availableWidth * viewSettingsRef.current.gridWidth / 100);
        return Math.max(180, Math.min(getGridContentWidth(), requestedWidth, keepChartVisibleWidth));
      };
      gantt.config.grid_elastic_columns = false;
      gantt.config.layout = {
        css: "gantt_container",
        rows: [
          {
            cols: [
              {
                width: getGridViewportWidth(),
                rows: [
                  { view: "grid", id: "grid", scrollX: "gridScroll", scrollY: "scrollVer", scrollable: true },
                  { view: "scrollbar", id: "gridScroll", group: "horizontal" },
                ],
              },
              { resizer: true, width: 1 },
              {
                rows: [
                  { view: "timeline", id: "timeline", scrollX: "scrollHor", scrollY: "scrollVer" },
                  { view: "scrollbar", id: "scrollHor", group: "horizontal" },
                ],
              },
              { view: "scrollbar", id: "scrollVer" },
            ],
          },
        ],
      };
      gantt.config.min_column_width = 12;
      gantt.config.scales = ganttScales(viewSettingsRef.current.scale, viewSettingsRef.current.zoom);
      gantt.templates.task_class = (_s: Date, _e: Date, task: any) =>
        task.type === "project" ? "gantt-header-bar" : `gantt-task-bar plan-color-${chartColor(task.plan_color).slice(1).toLowerCase()}`;
      gantt.templates.task_text = () => "";
      gantt.templates.rightside_text = (_s: Date, _e: Date, task: any) => escapeHtml(task.text);
      gantt.templates.grid_row_class = (_s: Date, _e: Date, task: any) => task.type === "project" ? "plan-header-row" : "";
      gantt.templates.task_row_class = gantt.templates.grid_row_class;
      const dayClass = (date: Date) => {
        const today = new Date();
        if (date.toDateString() === today.toDateString()) return "plan-today";
        return date.getDay() === 0 || date.getDay() === 6 ? "plan-weekend" : "";
      };
      gantt.templates.scale_cell_class = dayClass;
      gantt.templates.timeline_cell_class = (_t: any, date: Date) => {
        return dayClass(date);
      };
      gantt.templates.grid_header_class = (name: string) => name === "add" ? "" : "dialoggg-column-resize";

      gantt.init(containerRef.current!);
      const containerResizeObserver = new ResizeObserver(measureGridDivider);
      containerResizeObserver.observe(containerRef.current!);
      requestAnimationFrame(() => requestAnimationFrame(measureGridDivider));

      const onDividerPointerUp = (event: PointerEvent) => {
        if (fullScreenRef.current || !(event.target as HTMLElement | null)?.closest(".gantt_resizer, .gantt_resizer_x")) return;
        window.setTimeout(() => {
          const width = containerRef.current?.querySelector<HTMLElement>(".gantt_grid")?.getBoundingClientRect().width;
          const available = containerRef.current?.clientWidth || 0;
          if (width && available) setGridWidth(Math.max(25, Math.min(65, Math.round(width / available * 100))));
          measureGridDivider();
        }, 30);
      };
      window.addEventListener("pointerup", onDividerPointerUp);

      // Column resizing is implemented here instead of relying on DHTMLX PRO-only resizing.
      // Widths are saved per project and per view mode in this browser.
      const onResizeStart = (event: PointerEvent) => {
        if (event.button !== 0) return;
        const header = (event.target as HTMLElement).closest<HTMLElement>(".gantt_grid_head_cell.dialoggg-column-resize");
        if (!header) return;
        const name = header.dataset.columnName;
        if (!name || name === "add") return;
        const bounds = header.getBoundingClientRect();
        if (bounds.right - event.clientX > 18) return;
        const column = gantt.config.columns.find((item: any) => item.name === name);
        if (!column) return;
        const options = getColumnWidthBounds(column);
        const startX = event.clientX;
        const startWidth = Number(column.width) || options.width;
        const oldCursor = document.body.style.cursor;
        const oldUserSelect = document.body.style.userSelect;
        event.preventDefault();
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onPointerMove = (moveEvent: PointerEvent) => {
          column.width = Math.max(options.min, Math.min(options.max, Math.round(startWidth + moveEvent.clientX - startX)));
          gantt.render();
        };
        const onPointerUp = () => {
          document.removeEventListener("pointermove", onPointerMove);
          document.removeEventListener("pointerup", onPointerUp);
          document.removeEventListener("pointercancel", onPointerUp);
          stopActiveResize = null;
          document.body.style.cursor = oldCursor;
          document.body.style.userSelect = oldUserSelect;
          const gridColumn = gantt.config.layout.rows[0].cols[0];
          gridColumn.width = getGridViewportWidth();
          gantt.resetLayout();
          gantt.render();
          try {
            window.localStorage.setItem(columnWidthStorageKey, JSON.stringify(
              Object.fromEntries(gantt.config.columns
                .filter((item: any) => item.name !== "add")
                .map((item: any) => [item.name, Number(item.width)])),
            ));
          } catch {
            setMessage("Column widths changed, but this browser could not save the layout preference.");
          }
        };
        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp, { once: true });
        document.addEventListener("pointercancel", onPointerUp, { once: true });
        stopActiveResize = () => {
          document.removeEventListener("pointermove", onPointerMove);
          document.removeEventListener("pointerup", onPointerUp);
          document.removeEventListener("pointercancel", onPointerUp);
          document.body.style.cursor = oldCursor;
          document.body.style.userSelect = oldUserSelect;
        };
      };
      containerRef.current?.addEventListener("pointerdown", onResizeStart);
      removeResizeListener = () => containerRef.current?.removeEventListener("pointerdown", onResizeStart);
      const previousRemoveResizeListener = removeResizeListener;
      removeResizeListener = () => {
        previousRemoveResizeListener?.();
        window.removeEventListener("pointerup", onDividerPointerUp);
        containerResizeObserver.disconnect();
      };

      // ===== Intercept the "+" / new-task to open OUR popup =====
      attachGanttEvent("onTaskCreated", (task: any) => {
        if (!canEdit || stalePlanRef.current) return false;
        const todayIso = isoFromDate(gantt, new Date());
        const clickedTask = planTasksRef.current.find(item => Number(item.id) === Number(task.parent));
        const clickedIsRoot = !!clickedTask?.is_root;
        const clickedIsLeaf = !!clickedTask && clickedTask.type !== "project";
        const parentId = clickedIsLeaf ? Number(clickedTask.parent || 0) : Number(task.parent || 0);
        const startIso = clickedIsRoot
          ? String(clickedTask.start_date || todayIso)
          : clickedTask?.end_date
            ? alignWorkingDay(addDays(String(clickedTask.end_date).slice(0, 10), 1), { allowSaturday: false, allowSunday: false }, 1)
            : todayIso;
        setTaskModal({
          mode: "add", id: null, text: "", start_date: startIso,
          duration: 1, color: projectColorRef.current, parent: parentId,
          resourceIds: [], version: 1, isHeader: false, isRoot: false,
          allowSaturday: false, allowSunday: false, progress: 0,
          categoryId: null, externalVisible: false, isTemp: false,
        });
        return false; // block default add; we add on Save
      });

      // ===== Intercept double-click / lightbox to open OUR popup =====
      attachGanttEvent("onBeforeLightbox", (id: any) => {
        if (!canEdit || stalePlanRef.current) return false;
        const t = gantt.getTask(id);
        openEditModal(id, t);
        return false;
      });

      async function openEditModal(id: any, t: any) {
        if (t.is_root) { setMessage("The Project root is protected and derives its schedule from descendant Tasks."); return; }
        let resourceIds: number[] = [];
        if (t.type !== "project") {
          try {
            const response = await fetch(`/api/projects/${projectId}/tasks/${id}/resources`, { cache: "no-store" });
            const j = await response.json();
            if (!response.ok || !Array.isArray(j.resource_ids)) throw new Error("Resource assignments unavailable.");
            resourceIds = j.resource_ids.map(Number).filter((resourceId: number) => Number.isInteger(resourceId) && resourceId > 0);
          } catch {
            // Never open the editor with an empty fallback: saving a duration
            // would otherwise interpret a failed lookup as an intentional clear.
            setMessage("This Task’s Resource assignments could not be loaded. Refresh the Project Plan and try again; no changes were made.");
            return;
          }
        }
        setTaskModal({
          mode: "edit", id,
          text: t.text, start_date: isoFromDate(gantt, t.start_date),
          duration: Number(t.working_duration ?? t.duration), color: t.plan_color || PROJECT_CALENDAR_COLORS[0],
          parent: t.parent || 0, resourceIds, isTemp: false,
          version: Number(t.version) || 1, isHeader: t.type === "project", isRoot: !!t.is_root,
          allowSaturday: !!t.allow_saturday, allowSunday: !!t.allow_sunday,
          progress: Number(t.progress) || 0, categoryId: t.resource_category_id ?? null,
          externalVisible: !!t.external_visible,
        });
      }

      openPlanTaskEditor = (taskId: number) => {
        if (!gantt.isTaskExists(taskId)) { pendingPlanTaskId = taskId; return; }
        void openEditModal(taskId, gantt.getTask(taskId));
      };

      // ===== Task drag / resize → persist + cascade =====
      attachGanttEvent("onBeforeTaskDrag", (_id: any, mode: string) => {
        if (!canEdit || stalePlanRef.current) return false;
        dragModeRef.current = String(mode);
        return true;
      });

      // Row dragging changes order only; task-bar dragging continues to reschedule as before.
      attachGanttEvent("onBeforeTaskMove", (id: any, parent: any) => {
        const task = gantt.getTask(id);
        if (!canEdit || stalePlanRef.current) return false;
        if (!canEdit || task.is_root) {
          setMessage("The protected Project root cannot be reordered.");
          return false;
        }
        if (Number(parent) !== Number(task.parent || 0)) {
          setMessage("Tasks can only be reordered within the same Header.");
          return false;
        }
        setMessage("");
        return true;
      });
      attachGanttEvent("onAfterTaskMove", async (id: any, parent: any, index: number) => {
        if (activeGanttChartOwner !== chartOwner) return;
        if (syncingRef.current || reorderInFlightRef.current) return;
        reorderInFlightRef.current = true;
        let versionConflict = false;
        try {
          const response = await authenticatedFetch(`/api/projects/${projectId}/tasks`, {
            method: "PATCH", headers: { "content-type": "application/json" },
            body: JSON.stringify({ taskId: Number(id), parentId: Number(parent), index: Number(index), planVersion: planVersionRef.current }),
          });
          const payload = await response.json().catch(() => ({}));
          if (activeGanttChartOwner !== chartOwner) return;
          if (isPlanVersionConflict(payload)) { versionConflict = true; markPlanStale(); }
          else if (!response.ok) setMessage(payload?.error?.message || "The Task order could not be saved.");
          else { announcePlanChanged(); setMessage("Task order saved."); }
        } catch {
          if (activeGanttChartOwner === chartOwner) setMessage("The Task order could not be saved. Check your connection and try again.");
        } finally {
          if (activeGanttChartOwner === chartOwner && !versionConflict) {
            try { await reload(); } catch { setMessage("The Project Plan could not be refreshed after reordering."); }
          }
          reorderInFlightRef.current = false;
        }
      });

      attachGanttEvent("onAfterTaskUpdate", async (id: any) => {
        if (syncingRef.current) return;
        if (!canEdit || stalePlanRef.current) { await reload(); return; }
        const fresh = gantt.getTask(id);
        const resize = dragModeRef.current === String(gantt.config.drag_mode.resize);
        dragModeRef.current = null;
        const duration = resize
          ? workingDuration(fresh.start_date, fresh.end_date, !!fresh.allow_saturday, !!fresh.allow_sunday)
          : Number(fresh.working_duration ?? fresh.duration);
        const response = await authenticatedFetch(`/api/projects/${projectId}/tasks/${id}`, {
          method: "PUT", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: fresh.text, start_date: isoFromDate(gantt, fresh.start_date),
            duration, progress: fresh.progress,
            color: fresh.plan_color, parent: fresh.parent, version: fresh.version,
            allow_saturday: !!fresh.allow_saturday, allow_sunday: !!fresh.allow_sunday,
            resource_category_id: fresh.resource_category_id,
            external_visible: !!fresh.external_visible,
            planVersion: planVersionRef.current,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (isPlanVersionConflict(payload)) { markPlanStale(); return; }
        if (!response.ok) setMessage(payload?.error?.message || "The Task change was not saved.");
        else announcePlanChanged();
        await reload();
      });

      attachGanttEvent("onBeforeTaskDelete", () => {
        setMessage("Open the Task editor and use Delete so the schedule impact can be confirmed.");
        return false;
      });

      // ===== Link drawn → open the "how to link" popup =====
      attachGanttEvent("onBeforeLinkAdd", (_id: any, link: any) => {
        if (!canEdit || stalePlanRef.current) return false;
        if (syncingRef.current) return true;
        const src = gantt.getTask(link.source);
        const tgt = gantt.getTask(link.target);
        const source = planTasksRef.current.find((task: any) => String(task.id) === String(link.source));
        const target = planTasksRef.current.find((task: any) => String(task.id) === String(link.target));
        const suggestedLag = Object.fromEntries((["fs", "ss", "ff", "sf"] as const).map(linkType => [
          linkType,
          source && target ? suggestedDependencyLag(
            String(source.start_date).slice(0, 10), String(source.end_date).slice(0, 10),
            String(target.start_date).slice(0, 10), String(target.end_date).slice(0, 10),
            linkType,
            { allowSaturday: !!target.allow_saturday, allowSunday: !!target.allow_sunday },
          ) : 0,
        ])) as LinkModal["suggestedLag"];
        // dhtmlx tells us which ends were connected — translate to our type
        const typeMap: Record<string, LinkModal["linkType"]> = { "0": "fs", "1": "ss", "2": "ff", "3": "sf" };
        const linkType = typeMap[String(link.type)] || "fs";
        setLinkModal({
          sourceId: link.source, targetId: link.target,
          sourceName: src?.text || "Task", targetName: tgt?.text || "Task",
          linkType, lag: suggestedLag[linkType], suggestedLag,
        });
        return false; // block auto-add; we add via API on confirm
      });

      attachGanttEvent("onAfterLinkDelete", async (id: any) => {
        if (syncingRef.current) return;
        if (!canEdit || stalePlanRef.current) { await reload(); return; }
        const response = await authenticatedFetch(`/api/projects/${projectId}/links/${id}`, {
          method: "DELETE", headers: { "content-type": "application/json" },
          body: JSON.stringify({ planVersion: planVersionRef.current }),
        });
        const payload = await response.json().catch(() => ({}));
        if (isPlanVersionConflict(payload)) { markPlanStale(); return; }
        if (!response.ok) setMessage(payload?.error?.message || "The dependency was not removed.");
        else announcePlanChanged();
        await reload();
      });

      await reload();
      if (pendingPlanTaskId !== null) {
        const taskId = pendingPlanTaskId;
        pendingPlanTaskId = null;
        openPlanTaskEditor?.(taskId);
      }
      const requestedTaskId = Number(new URLSearchParams(window.location.search).get("editTaskId"));
      if (Number.isInteger(requestedTaskId) && requestedTaskId > 0) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("editTaskId");
        window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
        if (gantt.isTaskExists(requestedTaskId)) openPlanTaskEditor?.(requestedTaskId);
        else setMessage("This Task is no longer available in the Project Plan.");
      }
      try { gantt.showDate(new Date()); } catch {}
      if (!cancelled) setReady(true);
    }

    init();
    return () => {
      cancelled = true;
      stopActiveResize?.();
      removeResizeListener?.();
      window.removeEventListener("dialoggg:open-plan-task", openPlanTaskHandler);
      for (const eventId of ganttEventIds) {
        try { ganttRef.current?.detachEvent(eventId); } catch {}
      }
      if (activeGanttChartOwner === chartOwner) {
        activeGanttChartOwner = null;
        if (ganttRef.current) { try { ganttRef.current.clearAll(); } catch {} }
      }
    };
  }, [projectId, reload]);

  function focusTaskStart(taskId: number) {
    const gantt = ganttRef.current;
    if (!gantt || !gantt.isTaskExists(taskId)) return;
    const task = gantt.getTask(taskId);
    if (task?.start_date instanceof Date && !Number.isNaN(task.start_date.getTime())) {
      gantt.showDate(task.start_date);
    }
  }

  // ---- Save handler for the Task popup ----
  async function saveTask() {
    if (!canEdit || stalePlanRef.current) return;
    if (!taskModal) return;
    setMessage("");
    if (!taskModal.text.trim()) { setMessage("Enter the Task Name."); return; }
    if (!taskModal.isHeader && (!Number.isInteger(taskModal.duration) || taskModal.duration < 1)) { setMessage("Duration must be a whole number of at least 1 working day."); return; }
    const payload = {
      text: taskModal.text.trim(),
      start_date: taskModal.start_date,
      duration: Number(taskModal.duration),
      color: taskModal.color,
      parent: taskModal.parent,
      progress: taskModal.progress,
      type: taskModal.isHeader ? "project" : "task",
      isHeader: taskModal.isHeader,
      allowSaturday: taskModal.allowSaturday,
      allowSunday: taskModal.allowSunday,
      resourceCategoryId: taskModal.categoryId,
      externalVisible: taskModal.externalVisible,
      version: taskModal.version,
      planVersion: planVersionRef.current,
      resourceIds: taskModal.resourceIds,
    };

    let taskId = taskModal.id;
    let response: Response;
    if (taskModal.mode === "add") {
      response = await authenticatedFetch(`/api/projects/${projectId}/tasks`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await response.json().catch(() => ({}));
      if (!response.ok) { if (isPlanVersionConflict(j)) markPlanStale(); else setMessage(j?.error?.message || "The Task was not created."); return; }
      taskId = j.id;
    } else {
      response = await authenticatedFetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await response.json().catch(() => ({}));
      if (!response.ok) { if (isPlanVersionConflict(j)) markPlanStale(); else setMessage(j?.error?.message || "The Task was not saved."); return; }
    }
    announcePlanChanged();
    setTaskModal(null);
    setMessage(`${taskModal.text.trim()} was saved and the Project Plan was recalculated.`);
    await reload();
    if (taskModal.mode === "edit" && taskId != null) focusTaskStart(Number(taskId));
  }

  async function deleteTask() {
    if (!canEdit || stalePlanRef.current) return;
    if (!taskModal || taskModal.mode !== "edit") { setTaskModal(null); return; }
    const response = await authenticatedFetch(`/api/projects/${projectId}/tasks/${taskModal.id}`, {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify({ planVersion: planVersionRef.current, version: taskModal.version }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { if (isPlanVersionConflict(payload)) markPlanStale(); else setMessage(payload?.error?.message || "The Task was not deleted."); return; }
    announcePlanChanged();
    setTaskModal(null);
    setMessage(`${taskModal.text} and its dependency links were deleted. The remaining Plan was recalculated.`);
    await reload();
  }

  // ---- Save handler for the Link popup ----
  async function saveLink() {
    if (!canEdit || stalePlanRef.current) return;
    if (!linkModal) return;
    setMessage("");
    const r = await authenticatedFetch(`/api/projects/${projectId}/links`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: linkModal.sourceId, target: linkModal.targetId,
        type: LINK_TYPE_TO_DHTMLX[linkModal.linkType], lag: Number(linkModal.lag) || 0,
        planVersion: planVersionRef.current,
      }),
    });
    const payload = await r.json().catch(() => ({}));
    if (r.ok) {
      announcePlanChanged();
      setLinkModal(null);
      setMessage("The dependency was saved and every affected Task was recalculated.");
      await reload();
    } else {
      if (isPlanVersionConflict(payload)) markPlanStale();
      else setMessage(payload?.error?.message || "The dependency could not be created.");
    }
  }

  const grouped = categories.map(c => ({
    category: c,
    members: resources.filter(r => r.category_id === c.id),
  }));
  const uncategorized = resources.filter(r => !r.category_id);
  const headerOptions = planTasks.filter(task => task.type === "project" && !task.is_root);
  const updateTaskModal = (patch: Partial<TaskModal>) => {
    setTaskModal(current => current ? { ...current, ...patch } : current);
  };

  function openAddTask() {
    if (!canEdit || stalePlanRef.current) return;
    const gantt = ganttRef.current;
    const todayIso = gantt ? isoFromDate(gantt, new Date()) : new Date().toISOString().slice(0, 10);
    setTaskModal({ mode: "add", id: null, text: "", start_date: todayIso, duration: 1, color: projectColorRef.current, parent: 0, resourceIds: [], version: 1, isHeader: false, isRoot: false, allowSaturday: false, allowSunday: false, progress: 0, categoryId: null, externalVisible: false, isTemp: false });
  }

  function updateFullscreen(next: boolean) {
    const current = new URL(window.location.href);
    const returnKey = `dialoggg:gantt-return:v1:${userId}:${projectId}`;
    if (next) {
      try { window.sessionStorage.setItem(returnKey, `${current.pathname}${current.search}${current.hash || "#plan"}`); } catch {}
      current.searchParams.set("view", "full");
      if (!current.hash) current.hash = "#plan";
      window.history.pushState({}, "", current);
    } else {
      let returnTo = "";
      try { returnTo = window.sessionStorage.getItem(returnKey) || ""; window.sessionStorage.removeItem(returnKey); } catch {}
      if (returnTo && returnTo.startsWith(`/projects/${projectId}`) && !new URL(returnTo, window.location.origin).searchParams.has("view")) {
        window.history.replaceState({}, "", returnTo);
      } else {
        current.searchParams.delete("view");
        if (!current.hash) current.hash = "#plan";
        window.history.replaceState({}, "", current);
      }
    }
    window.dispatchEvent(new Event("dialoggg:plan-fullscreen-change"));
  }

  useEffect(() => {
    if (!fullScreen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") updateFullscreen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullScreen, userId, projectId]);

  function fitProjectToTimeline() {
    const gantt = ganttRef.current;
    const tasks = planTasks.filter(task => task.type !== "project" || task.is_root).length ? planTasks.filter(task => task.type !== "project") : planTasks;
    const starts = tasks.map(task => String(task.start_date || "").slice(0, 10)).filter(Boolean).sort();
    const ends = tasks.map(task => String(task.end_date || task.start_date || "").slice(0, 10)).filter(Boolean).sort();
    if (!gantt || !starts.length || !ends.length) return;
    const start = new Date(`${starts[0]}T12:00:00`);
    const end = new Date(`${ends[ends.length - 1]}T12:00:00`);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const units = scale === "day" ? days : scale === "week" ? Math.ceil(days / 7) : Math.ceil(days / 30);
    const baseWidth = scale === "day" ? 40 : scale === "week" ? 72 : 96;
    const grid = gridCollapsed ? 220 : Math.floor((containerRef.current?.clientWidth || 1200) * gridWidth / 100);
    const available = Math.max(160, (containerRef.current?.clientWidth || 1200) - grid - 32);
    const nextZoom = Math.max(25, Math.min(100, Math.floor(available / Math.max(1, units) / baseWidth * 100)));
    setZoom(nextZoom);
    gantt.showDate(start);
  }

  function openFullScreenWindow() {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "full");
    if (!url.hash) url.hash = "#plan";
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  return (
    <div ref={chartShellRef} className={`dialoggg-plan-chart ${compact ? "is-compact" : ""} ${fullScreen ? "is-fullscreen" : ""}`} style={!fullScreen && availablePanelHeight ? { height: `${availablePanelHeight}px` } : undefined} data-testid="persistent-gantt" aria-label="Live Project Plan Gantt chart">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
      <div className="plan-chart-toolbar">
        <div className="plan-chart-toolbar-left">
          {fullScreen && <button type="button" className="plan-chart-control" onClick={() => updateFullscreen(false)}>← Back to project</button>}
          {fullScreen && <div className="plan-fullscreen-title"><strong>{projectName}</strong><span>Project Plan</span></div>}
          {canEdit && <button type="button" onClick={openAddTask} className="plan-chart-add">+ Add Task</button>}
        </div>
        <div className="plan-chart-controls" aria-label="Project Plan chart controls">
          <div className="plan-chart-segment" aria-label="Date scale">
            {(["day", "week", "month"] as const).map(value => <button key={value} type="button" aria-pressed={scale === value} className={scale === value ? "active" : ""} onClick={() => setScale(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
          </div>
          <div className="plan-chart-zoom"><span>Zoom</span><button type="button" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(25, value - 5))}>−</button><input aria-label="Zoom level" type="range" min="25" max="100" step="5" value={zoom} onChange={event => setZoom(Number(event.target.value))} /><button type="button" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(100, value + 5))}>+</button><span className="plan-chart-zoom-value">{zoom}%</span><button type="button" className="plan-chart-fit" onClick={fitProjectToTimeline}>Fit</button></div>
          <button type="button" className="plan-chart-control" onClick={() => { const gantt = ganttRef.current; if (gantt) gantt.showDate(new Date()); }}>Today</button>
          <button type="button" aria-pressed={compact} className={`plan-chart-control ${compact ? "active" : ""}`} onClick={() => setCompact(value => !value)}>☰ Compact</button>
          {!fullScreen && <button type="button" className="plan-chart-control" onClick={() => updateFullscreen(true)}>⛶ Full screen</button>}
          {!fullScreen && <button type="button" className="plan-chart-control plan-chart-window" aria-label="Open full-screen Project Plan in a new window" title="Open in new window" onClick={openFullScreenWindow}>↗</button>}
          {fullScreen && <button type="button" className="plan-chart-control plan-chart-window" aria-label="Open in new window" title="Open in new window" onClick={openFullScreenWindow}>↗</button>}
          {fullScreen && <button type="button" className="plan-chart-control" onClick={() => updateFullscreen(false)}>Exit full screen <kbd>Esc</kbd></button>}
        </div>
      </div>
      {stalePlan && <div className="plan-stale-lock" role="alert" aria-live="assertive">
        <div className="plan-stale-lock-card">
          <strong>This plan was updated in another tab.</strong>
          <span>Refresh this tab before making changes. The other tab will also need to refresh before editing this plan.</span>
          <button type="button" onClick={() => window.location.reload()}>Refresh Project Plan</button>
        </div>
      </div>}
      {message && <div role="status" className="m-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">{message}</div>}
      <div className="plan-chart-scroll">
        <div ref={containerRef} style={{ width: "100%", minWidth: 0, height: "100%" }} />
        {!fullScreen && <button type="button" className="plan-grid-collapse-handle" style={{ left: `${gridDividerLeft ?? Math.floor((containerRef.current?.clientWidth || 1200) * gridWidth / 100) - 11}px` }} aria-label={gridCollapsed ? "Show task columns" : "Collapse task columns"} title={gridCollapsed ? "Show task columns" : "Collapse task columns"} onClick={() => setGridCollapsed(value => !value)}>{gridCollapsed ? "›" : "‹"}</button>}
      </div>
      {!fullScreen && <div className="plan-chart-legend">
        <span><i style={{ background: "#0E123B" }} />Header / derived schedule</span>
        <span><i style={{ background: "#3B417D" }} />Task color / completed portion</span>
        <span><i className="plan-legend-today" />Today</span>
        <span>Done = saved task progress · Resources = assigned people</span>
      </div>}

      {/* ============ TASK POPUP ============ */}
      {taskModal && (
        <Modal onClose={() => setTaskModal(null)} title={taskModal.mode === "add" ? "Add Task" : "Edit Task"}>
          <div className="space-y-4">
            <div>
              <label htmlFor="gantt-task-name" className="block text-sm font-medium mb-1">Task Name</label>
              <input
                id="gantt-task-name"
                autoFocus value={taskModal.text}
                onChange={e => updateTaskModal({ text: e.target.value })}
                className="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. Concrete Pour"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={taskModal.isHeader}
                disabled={taskModal.mode === "edit"}
                onChange={event => updateTaskModal({ isHeader: event.target.checked, resourceIds: [], categoryId: null })}
              />
              Header Task
            </label>
            <div>
              <label htmlFor="gantt-task-parent" className="block text-sm font-medium mb-1">Parent Header</label>
              <select
                id="gantt-task-parent"
                value={taskModal.parent || 0}
                onChange={event => updateTaskModal({ parent: Number(event.target.value) })}
                className="w-full px-3 py-2 border rounded text-sm"
              >
                <option value={0}>Project root</option>
                {headerOptions.filter(option => option.id !== taskModal.id).map(option => <option key={option.id} value={option.id}>{option.text}</option>)}
              </select>
            </div>
            {!taskModal.isHeader && <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="gantt-task-start" className="block text-sm font-medium mb-1">Start Date</label>
                <input
                  id="gantt-task-start"
                  type="date" value={taskModal.start_date}
                  onChange={e => updateTaskModal({ start_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor="gantt-task-duration" className="block text-sm font-medium mb-1">Duration (days)</label>
                <input
                  id="gantt-task-duration"
                  type="number" min={1} value={taskModal.duration}
                  onChange={e => updateTaskModal({ duration: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>}

            {!taskModal.isHeader && <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={taskModal.allowSaturday} onChange={event => updateTaskModal({ allowSaturday: event.target.checked })} />Allow work on Saturday</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={taskModal.allowSunday} onChange={event => updateTaskModal({ allowSunday: event.target.checked })} />Allow work on Sunday</label>
              <label className="text-sm">Task Progress
                <span className="mt-1 flex items-center gap-2">
                  <input aria-label="Task Progress" type="number" min={0} max={100} value={Math.round(taskModal.progress * 100)} onChange={event => updateTaskModal({ progress: Math.max(0, Math.min(100, Number(event.target.value))) / 100 })} className="w-24 rounded border px-3 py-2" />
                  <span aria-hidden="true">%</span>
                </span>
              </label>
            </div>}

            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={taskModal.externalVisible} onChange={event => updateTaskModal({ externalVisible: event.target.checked })} />Visible in assigned External/Client Project view</label>

            <div>
              <label className="block text-sm font-medium mb-1">Color</label>
              <ColorSwatches label="Task color" colors={PROJECT_CALENDAR_COLORS} value={taskModal.color} onChange={color => updateTaskModal({ color })} />
            </div>

            {!taskModal.isHeader && <div>
              <label className="block text-sm font-medium mb-1">Assign Resources</label>
              {resources.length === 0 ? (
                <p className="text-xs text-gray-500 bg-gray-50 border rounded p-2">
                  No resources yet. Add employees, subs, or suppliers on the <b>Resources</b> page first.
                </p>
              ) : (
                <div className="grid max-h-56 grid-cols-1 gap-x-5 gap-y-2 overflow-auto rounded border p-2 sm:grid-cols-2">
                  {grouped.map(g => g.members.length > 0 && (
                    <div key={g.category.id} className="min-w-0">
                      <div className="text-xs font-semibold text-gray-500 uppercase">{g.category.name}</div>
                      {g.members.map(m => (
                        <label key={m.id} className="flex min-w-0 items-center gap-2 py-0.5 text-sm">
                          <input
                            type="checkbox"
                            checked={taskModal.resourceIds.includes(m.id)}
                            onChange={e => {
                              const checked = e.target.checked;
                              setTaskModal(current => current ? {
                                ...current,
                                resourceIds: checked ? [...current.resourceIds, m.id] : current.resourceIds.filter(x => x !== m.id),
                              } : current);
                            }}
                          />
                          <span className="truncate" title={m.name}>{m.name}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                  {uncategorized.map(m => (
                    <label key={m.id} className="flex min-w-0 items-center gap-2 py-0.5 text-sm">
                      <input
                        type="checkbox"
                        checked={taskModal.resourceIds.includes(m.id)}
                        onChange={e => {
                          const checked = e.target.checked;
                          setTaskModal(current => current ? {
                            ...current,
                            resourceIds: checked ? [...current.resourceIds, m.id] : current.resourceIds.filter(x => x !== m.id),
                          } : current);
                        }}
                      />
                      <span className="truncate" title={m.name}>{m.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>}

            {!taskModal.isHeader && <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded p-2">
              💡 To make this task depend on another, save it, then drag a link from one bar's edge
              circle to this one on the chart.
            </p>}
          </div>

          <div className="flex justify-between pt-4 mt-2 border-t">
            <div>
              {taskModal.mode === "edit" && (
                <button onClick={deleteTask} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded font-semibold text-sm">
                  Delete
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setTaskModal(null)} className="px-4 py-2 bg-gray-200 rounded font-semibold text-sm hover:bg-gray-300">
                Cancel
              </button>
              <button onClick={saveTask} className="px-5 py-2 bg-blue-700 text-white rounded font-semibold text-sm hover:bg-blue-800">
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============ LINK-TYPE POPUP ============ */}
      {linkModal && (
        <Modal onClose={() => setLinkModal(null)} title="How do you want to link these tasks?">
          <p className="text-sm text-gray-600 mb-4">
            Connecting <b>{linkModal.sourceName}</b> → <b>{linkModal.targetName}</b>
          </p>
          <div className="space-y-2">
            {LINK_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 border rounded p-3 cursor-pointer ${
                  linkModal.linkType === opt.value ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-blue-300"
                }`}
              >
                <input
                  type="radio" name="linktype" className="mt-1"
                  checked={linkModal.linkType === opt.value}
                  onChange={() => setLinkModal({ ...linkModal, linkType: opt.value, lag: linkModal.suggestedLag[opt.value] })}
                />
                <div>
                  <div className="font-semibold text-sm">{opt.title}</div>
                  <div className="text-xs text-gray-600">{opt.plain}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">
              Add a gap (lag) — extra days before the linked task starts
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number" value={linkModal.lag}
                onChange={e => setLinkModal({ ...linkModal, lag: Number(e.target.value) })}
                className="w-24 px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="text-sm text-gray-500">days (e.g. 7 for a concrete cure)</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 mt-2 border-t">
            <button onClick={() => setLinkModal(null)} className="px-4 py-2 bg-gray-200 rounded font-semibold text-sm hover:bg-gray-300">
              Cancel
            </button>
            <button onClick={saveLink} className="px-5 py-2 bg-blue-700 text-white rounded font-semibold text-sm hover:bg-blue-800">
              Create Link
            </button>
          </div>
        </Modal>
      )}

      <style jsx global>{`
        ${[...new Set(planTasks.map(task => chartColor(task.color)))].map(color => `.dialoggg-plan-chart .plan-color-${color.slice(1).toLowerCase()} { border-left:4px solid ${color} !important; }`).join("\n")}
        .tenant-theme .dialoggg-plan-chart, .dialoggg-plan-chart { position:relative; isolation:isolate; display:flex; min-height:0; flex-direction:column; background:#fff; color:#1c2233; border:1px solid #e6e4dc; border-radius:14px; overflow:hidden; font-family:'Space Grotesk',sans-serif; }
        .dialoggg-plan-chart .plan-chart-toolbar { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; min-height:58px; padding:8px 16px; border-bottom:1px solid #e6e4dc; background:#fff; }
        .dialoggg-plan-chart .plan-chart-toolbar-left, .dialoggg-plan-chart .plan-chart-controls { display:flex; align-items:center; flex-wrap:wrap; gap:7px; min-width:0; }
        .dialoggg-plan-chart .plan-chart-controls { justify-content:flex-end; }
        .dialoggg-plan-chart .plan-fullscreen-title { display:flex; align-items:baseline; gap:8px; margin-right:6px; color:#1c2233; white-space:nowrap; }
        .dialoggg-plan-chart .plan-fullscreen-title span { color:#6b7280; font-size:12px; }
        .dialoggg-plan-chart .plan-chart-title { color:#1c2233; font-size:19px; font-weight:600; margin:0; }
        .dialoggg-plan-chart .plan-chart-kicker { color:#6b7280; font:10px 'IBM Plex Mono',monospace; letter-spacing:.04em; margin-bottom:4px; }
        .dialoggg-plan-chart .plan-chart-add { background:#d1850b; color:#111827; border:1px solid #c77c00; padding:8px 14px; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap; }
        .dialoggg-plan-chart .plan-chart-add:hover { background:#e49a16; }
        .dialoggg-plan-chart .plan-chart-add:focus-visible { outline:3px solid #A9CF38; outline-offset:3px; }
        .dialoggg-plan-chart .plan-chart-control, .dialoggg-plan-chart .plan-chart-zoom button, .dialoggg-plan-chart .plan-chart-fit { display:inline-flex; align-items:center; justify-content:center; min-height:34px; gap:5px; border:1px solid #c9ced7; border-radius:6px; padding:5px 9px; background:#f8f8f6; color:#27334a; font-size:12px; font-weight:600; white-space:nowrap; cursor:pointer; }
        .dialoggg-plan-chart .plan-chart-control:hover, .dialoggg-plan-chart .plan-chart-zoom button:hover, .dialoggg-plan-chart .plan-chart-fit:hover { border-color:#d1850b; color:#8c5700; }
        .dialoggg-plan-chart .plan-chart-control.active, .dialoggg-plan-chart .plan-chart-segment button.active { border-color:#d1850b; background:#fff4d9; color:#895600; }
        .dialoggg-plan-chart .plan-chart-segment { display:inline-flex; align-items:center; gap:0; overflow:hidden; border:1px solid #c9ced7; border-radius:6px; background:#f8f8f6; }
        .dialoggg-plan-chart .plan-chart-segment button { min-height:34px; border:0; border-right:1px solid #d8dbe1; padding:5px 9px; background:transparent; color:#27334a; font-size:12px; cursor:pointer; }
        .dialoggg-plan-chart .plan-chart-segment button:last-child { border-right:0; }
        .dialoggg-plan-chart .plan-chart-zoom { display:inline-flex; align-items:center; gap:4px; padding:0 5px; border:1px solid #c9ced7; border-radius:6px; color:#4d5c73; font-size:11px; }
        .dialoggg-plan-chart .plan-chart-zoom input { width:76px; accent-color:#d1850b; }
        .dialoggg-plan-chart .plan-chart-zoom button { min-height:28px; border:0; padding:2px 5px; background:transparent; font-size:16px; }
        .dialoggg-plan-chart .plan-chart-zoom-value { min-width:34px; text-align:center; color:#27334a; }
        .dialoggg-plan-chart .plan-chart-fit { min-height:26px; border:0; background:transparent; color:#496b12; padding:2px 5px; }
        .dialoggg-plan-chart .plan-chart-control kbd { border:1px solid #aab2bf; border-radius:3px; padding:0 4px; font-size:10px; }
        .dialoggg-plan-chart .plan-chart-window { min-width:34px; font-size:18px; }
        .dialoggg-plan-chart .plan-stale-lock { position:absolute; z-index:100; inset:0; display:flex; align-items:center; justify-content:center; padding:24px; background:rgba(10,18,32,.76); backdrop-filter:blur(2px); }
        .dialoggg-plan-chart .plan-stale-lock-card { display:flex; width:min(520px,100%); flex-direction:column; align-items:center; gap:12px; padding:24px; border:1px solid #52617a; border-radius:12px; background:#17253a; color:#f8fafc; text-align:center; box-shadow:0 18px 48px rgba(0,0,0,.35); }
        .dialoggg-plan-chart .plan-stale-lock-card strong { font-size:18px; }
        .dialoggg-plan-chart .plan-stale-lock-card span { color:#c7d2e0; font-size:14px; line-height:1.5; }
        .dialoggg-plan-chart .plan-stale-lock-card button { margin-top:4px; border:1px solid #d1850b; border-radius:6px; padding:9px 16px; background:#d1850b; color:#111827; font-weight:700; cursor:pointer; }
        .dialoggg-plan-chart .plan-stale-lock-card button:focus-visible { outline:3px solid #a9cf38; outline-offset:3px; }
        .dialoggg-plan-chart .plan-chart-scroll { flex:1 1 auto; width:100%; height:auto; min-height:0; overflow:hidden; }
        .dialoggg-plan-chart .gantt_container { --dhx-gantt-font-family:'Space Grotesk',sans-serif; --dhx-gantt-font-size:13px; --dhx-gantt-base-colors-select:#eeedf5; border:none; border-radius:0; background:#fff; color:#1c2233; }
        .dialoggg-plan-chart .gantt_container, .dialoggg-plan-chart .gantt_layout_root { height:100% !important; }
        .dialoggg-plan-chart .gantt_grid, .dialoggg-plan-chart .gantt_task, .dialoggg-plan-chart .gantt_grid_data, .dialoggg-plan-chart .gantt_task_bg { background:#fff; color:#1c2233; }
        .dialoggg-plan-chart .gantt_grid_scale, .dialoggg-plan-chart .gantt_task_scale { background:#fbfaf7; color:#6b7280; border-color:#e6e4dc; }
        .dialoggg-plan-chart .gantt_grid_head_cell { color:#6b7280; font:10.5px/52px 'IBM Plex Mono',monospace; text-transform:uppercase; letter-spacing:.04em; border-color:#e6e4dc; }
        .dialoggg-plan-chart .gantt_grid_head_cell.dialoggg-column-resize { position:relative; padding-right:20px; }
        .dialoggg-plan-chart .gantt_grid_head_cell.dialoggg-column-resize::after { content:"↔"; position:absolute; z-index:5; top:50%; right:2px; display:flex; width:17px; height:22px; transform:translateY(-50%); align-items:center; justify-content:center; border:1px solid #c7cada; border-radius:4px; background:#e9eaf2; color:#3B417D; font:700 12px/1 Arial,sans-serif; cursor:col-resize; }
        .dialoggg-plan-chart .gantt-reorder-grip { display:inline-block; margin-right:6px; color:#7b8298; font-size:16px; line-height:1; vertical-align:middle; cursor:grab; }
        .dialoggg-plan-chart .gantt_row:hover .gantt-reorder-grip { color:#3B417D; }
        .dialoggg-plan-chart .gantt_row.gantt_drag_marker .gantt-reorder-grip { cursor:grabbing; }
        .dialoggg-plan-chart .gantt_grid_head_cell.dialoggg-column-resize:hover::after { border-color:#3B417D; background:#3B417D; color:#fff; }
        .dialoggg-plan-chart .gantt_scale_cell { color:#6b7280; font:10.5px/26px 'IBM Plex Mono',monospace; border-color:#f0efe9; }
        .dialoggg-plan-chart .gantt_scale_line:first-child .gantt_scale_cell { color:#1c2233; font:600 12.5px/26px 'Space Grotesk',sans-serif; }
        .dialoggg-plan-chart .gantt_row, .dialoggg-plan-chart .gantt_task_row { background:#fff; border-color:#f0efe9; color:#1c2233; }
        .dialoggg-plan-chart .gantt_row.plan-header-row, .dialoggg-plan-chart .gantt_task_row.plan-header-row { background:#fbfaf7; font-weight:600; }
        .dialoggg-plan-chart .gantt_cell { border-color:#f0efe9; font-size:13px; }
        .dialoggg-plan-chart .gantt_cell[data-column-name="resources"] { color:#6b7280; font-size:12px; }
        .dialoggg-plan-chart .gantt_cell[data-column-name="progress"] { color:#6b7280; font:12px/1.2 'IBM Plex Mono',monospace; padding-right:14px; }
        .dialoggg-plan-chart.is-compact .gantt_cell { font-size:12px; }
        .dialoggg-plan-chart.is-compact .gantt_cell[data-column-name="resources"], .dialoggg-plan-chart.is-compact .gantt_cell[data-column-name="progress"] { font-size:11px; }
        .dialoggg-plan-chart .gantt_tree_content { overflow:hidden; text-overflow:ellipsis; }
        .dialoggg-plan-chart .gantt_tree_icon.gantt_folder_open, .dialoggg-plan-chart .gantt_tree_icon.gantt_folder_closed, .dialoggg-plan-chart .gantt_tree_icon.gantt_file { display:none; }
        .dialoggg-plan-chart .plan-group-dot { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:7px; }
        .dialoggg-plan-chart .gantt_task_cell { border-color:#f0efe9; }
        .dialoggg-plan-chart .gantt_task_cell.plan-weekend, .dialoggg-plan-chart .gantt_scale_cell.plan-weekend { background:#f7f5ef !important; }
        .dialoggg-plan-chart .gantt_task_cell.plan-today, .dialoggg-plan-chart .gantt_scale_cell.plan-today { background:rgba(14,18,59,.05) !important; border-left:1px solid #c8c9d2; border-right:1px solid #c8c9d2; color:#0E123B; font-weight:700; }
        .dialoggg-plan-chart .gantt-task-bar { border:none; border-radius:5px; box-shadow:inset 0 0 0 1px rgba(0,0,0,.05); }
        .dialoggg-plan-chart .gantt-task-bar .gantt_task_progress { opacity:1; border:none; border-radius:5px 0 0 5px; }
        .dialoggg-plan-chart .gantt_task_line.gantt-header-bar { height:8px !important; margin-top:6px; border:0; border-radius:4px; background:#0E123B !important; }
        .dialoggg-plan-chart .gantt-header-bar .gantt_task_progress { background:#0E123B !important; border:0; }
        .dialoggg-plan-chart .gantt_task_line .gantt_side_content.gantt_right { color:#1c2233; font-size:12.5px; font-style:italic; padding-left:10px; }
        .dialoggg-plan-chart.is-compact .gantt_task_line .gantt_side_content.gantt_right { font-size:11.5px; }
        .dialoggg-plan-chart .gantt-header-bar .gantt_side_content.gantt_right { color:#0E123B; font-size:13.5px; font-weight:700; height:20px; line-height:20px; top:-6px; }
        .dialoggg-plan-chart .gantt_task_link .gantt_line_wrapper > div { background:#9395a7 !important; }
        .dialoggg-plan-chart .gantt_task_link .gantt_link_arrow_right { border-left-color:#9395a7 !important; }
        .dialoggg-plan-chart .gantt_task_link .gantt_link_arrow_left { border-right-color:#9395a7 !important; }
        .dialoggg-plan-chart .gantt_row.gantt_selected, .dialoggg-plan-chart .gantt_task_row.gantt_selected { background:#eeedf5; }
        .dialoggg-plan-chart .plan-chart-legend { display:flex; flex-wrap:wrap; gap:18px; padding:14px 26px; border-top:1px solid #e6e4dc; background:#fbfaf7; color:#6b7280; font-size:12px; }
        .dialoggg-plan-chart .plan-chart-legend span { display:inline-flex; align-items:center; gap:6px; }
        .dialoggg-plan-chart .plan-chart-legend i { width:9px; height:9px; border-radius:2px; }
        .dialoggg-plan-chart .plan-legend-today { background:#eeedf5; border:1px solid #9395a7; }
        .dialoggg-plan-chart .plan-chart-scroll { position:relative; }
        .dialoggg-plan-chart .plan-grid-collapse-handle { position:absolute; z-index:12; top:50%; display:flex; width:22px; height:30px; transform:translateY(-50%); align-items:center; justify-content:center; border:1px solid #c7cada; border-radius:10px; background:#fff; color:#3B417D; font:700 20px/1 Arial,sans-serif; cursor:pointer; box-shadow:0 1px 4px #0002; }
        .dialoggg-plan-chart.is-fullscreen { position:fixed; z-index:70; inset:0; display:flex; height:100vh; flex-direction:column; border:0; border-radius:0; }
        .dialoggg-plan-chart.is-fullscreen .plan-chart-toolbar { min-height:54px; flex-wrap:nowrap; gap:8px; padding:5px 10px; }
        .dialoggg-plan-chart.is-fullscreen .plan-chart-toolbar-left, .dialoggg-plan-chart.is-fullscreen .plan-chart-controls { flex-wrap:nowrap; gap:5px; }
        .dialoggg-plan-chart.is-fullscreen .plan-chart-scroll { flex:1 1 auto; height:auto; min-height:0; overflow:hidden; }
        .dialoggg-plan-chart.is-fullscreen .plan-chart-control { min-height:32px; padding:4px 7px; }
        .gantt-fullscreen-app { height:100vh; min-height:0; overflow:hidden; }
        @media(max-width:1000px) { .dialoggg-plan-chart.is-fullscreen .plan-chart-toolbar { flex-wrap:wrap; } .dialoggg-plan-chart.is-fullscreen .plan-chart-controls { flex-wrap:wrap; justify-content:flex-start; } }
        @media(max-width:640px) { .dialoggg-plan-chart .plan-chart-toolbar { padding:10px; } .dialoggg-plan-chart .plan-chart-title { font-size:16px; } .dialoggg-plan-chart .plan-chart-controls { justify-content:flex-start; } .dialoggg-plan-chart.is-fullscreen .plan-chart-toolbar { flex-wrap:wrap; } }
      `}</style>
    </div>
  );
}

// ---- Reusable modal shell ----
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b bg-blue-800 text-white rounded-t-lg">
          <h3 className="font-semibold">{title}</h3>
          <button aria-label={`Close ${title}`} onClick={onClose} className="text-white/80 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="gantt-modal-content p-5">{children}</div>
      </div>
    </div>
  );
}
