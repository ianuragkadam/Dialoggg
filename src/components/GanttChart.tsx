"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";

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
};

const COLORS = [
  "#5599dd", "#2e75b6", "#85b04f", "#2e7d32", "#d29c4b", "#e67e22",
  "#9b59b6", "#16a085", "#c0392b", "#7f8c8d", "#34495e", "#e84393",
];

const LINK_TYPE_TO_DHTMLX: Record<string, string> = { fs: "0", ss: "1", ff: "2", sf: "3" };

const LINK_OPTIONS: { value: LinkModal["linkType"]; title: string; plain: string }[] = [
  { value: "fs", title: "Finish → Start", plain: "Start this task WHEN the other task FINISHES (most common)" },
  { value: "ss", title: "Start → Start",  plain: "Start this task WHEN the other task STARTS (run them together)" },
  { value: "ff", title: "Finish → Finish",plain: "Finish this task WHEN the other task FINISHES" },
  { value: "sf", title: "Start → Finish", plain: "Finish this task WHEN the other task STARTS (rare)" },
];

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

export default function GanttChart({ projectId, canEdit = true }: { projectId: number; canEdit?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<any>(null);
  const syncingRef = useRef(false);
  const planVersionRef = useRef(1);
  const dragModeRef = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [taskModal, setTaskModal] = useState<TaskModal | null>(null);
  const [linkModal, setLinkModal] = useState<LinkModal | null>(null);
  const [message, setMessage] = useState("");
  const [planTasks, setPlanTasks] = useState<any[]>([]);

  // ---- server reload (suppresses sync events while parsing) ----
  const reload = useCallback(async () => {
    const gantt = ganttRef.current;
    const response = await fetch(`/api/projects/${projectId}/tasks`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "The Project Plan could not be loaded.");
    planVersionRef.current = Number(data.planVersion) || 1;
    setPlanTasks(data.data || []);
    syncingRef.current = true;
    try {
      gantt.clearAll();
      gantt.parse({
        ...data,
        data: (data.data || []).map((task: any) => ({ ...task, working_duration: task.duration })),
      });
    } finally {
      setTimeout(() => { syncingRef.current = false; }, 50);
    }
  }, [projectId]);

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

      gantt.config.date_format = "%Y-%m-%d";
      gantt.config.duration_unit = "day";
      gantt.config.scale_height = 50;
      gantt.config.row_height = 34;
      gantt.config.bar_height = 24;
      gantt.config.grid_width = 440;
      gantt.config.autosize = false;
      gantt.config.fit_tasks = true;
      gantt.config.auto_scheduling = true;
      gantt.config.auto_scheduling_strict = true;
      gantt.config.auto_scheduling_initial = true;
      gantt.config.details_on_create = false;   // we open our own popup
      gantt.config.min_column_width = 26;
      gantt.config.readonly = !canEdit;          // read-only roles cannot drag, resize, link, or edit

      gantt.config.columns = [
        { name: "text",       label: "Task Name", tree: true, width: 190, resize: true },
        { name: "start_date", label: "Start",     align: "center", width: 95 },
        { name: "duration",   label: "Days",      align: "center", width: 70,
          template: (task: any) => task.type === "project" ? "Derived" : String(task.working_duration ?? task.duration) },
        { name: "add",        label: "",          width: 40 },
      ];
      gantt.config.scales = [
        { unit: "month", step: 1, format: "%F %Y" },
        { unit: "week",  step: 1, format: (d: Date) => "Week of " + gantt.date.date_to_str("%M %j")(d) },
        { unit: "day",   step: 1, format: "%j" },
      ];
      gantt.templates.task_class = (_s: Date, _e: Date, task: any) =>
        task.type === "project" ? "gantt-header-bar" : "gantt-task-bar";
      gantt.templates.timeline_cell_class = (_t: any, date: Date) => {
        const d = date.getDay();
        return d === 0 || d === 6 ? "weekend" : "";
      };

      gantt.init(containerRef.current!);

      // ===== Intercept the "+" / new-task to open OUR popup =====
      gantt.attachEvent("onTaskCreated", (task: any) => {
        const todayIso = isoFromDate(gantt, new Date());
        const parentTask = task.parent && gantt.isTaskExists(task.parent) ? gantt.getTask(task.parent) : null;
        const startIso = parentTask ? isoFromDate(gantt, parentTask.start_date) : todayIso;
        setTaskModal({
          mode: "add", id: null, text: "", start_date: startIso,
          duration: 1, color: COLORS[0], parent: task.parent || 0,
          resourceIds: [], version: 1, isHeader: false, isRoot: false,
          allowSaturday: false, allowSunday: false, progress: 0,
          categoryId: null, externalVisible: false, isTemp: false,
        });
        return false; // block default add; we add on Save
      });

      // ===== Intercept double-click / lightbox to open OUR popup =====
      gantt.attachEvent("onBeforeLightbox", (id: any) => {
        const t = gantt.getTask(id);
        openEditModal(id, t);
        return false;
      });

      async function openEditModal(id: any, t: any) {
        if (t.is_root) { setMessage("The Project root is protected and derives its schedule from descendant Tasks."); return; }
        let resourceIds: number[] = [];
        try {
          const j = await fetch(`/api/projects/${projectId}/tasks/${id}/resources`).then(r => r.json());
          resourceIds = j.resource_ids || [];
        } catch {}
        setTaskModal({
          mode: "edit", id,
          text: t.text, start_date: isoFromDate(gantt, t.start_date),
          duration: Number(t.working_duration ?? t.duration), color: t.color || COLORS[0],
          parent: t.parent || 0, resourceIds, isTemp: false,
          version: Number(t.version) || 1, isHeader: t.type === "project", isRoot: !!t.is_root,
          allowSaturday: !!t.allow_saturday, allowSunday: !!t.allow_sunday,
          progress: Number(t.progress) || 0, categoryId: t.resource_category_id ?? null,
          externalVisible: !!t.external_visible,
        });
      }

      // ===== Task drag / resize → persist + cascade =====
      gantt.attachEvent("onBeforeTaskDrag", (_id: any, mode: string) => {
        dragModeRef.current = String(mode);
        return true;
      });

      gantt.attachEvent("onAfterTaskUpdate", async (id: any) => {
        if (syncingRef.current) return;
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
            color: fresh.color, parent: fresh.parent, version: fresh.version,
            allow_saturday: !!fresh.allow_saturday, allow_sunday: !!fresh.allow_sunday,
            resource_category_id: fresh.resource_category_id,
            external_visible: !!fresh.external_visible,
            planVersion: planVersionRef.current,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) setMessage(payload?.error?.message || "The Task change was not saved.");
        await reload();
      });

      gantt.attachEvent("onBeforeTaskDelete", () => {
        setMessage("Open the Task editor and use Delete so the schedule impact can be confirmed.");
        return false;
      });

      // ===== Link drawn → open the "how to link" popup =====
      gantt.attachEvent("onBeforeLinkAdd", (_id: any, link: any) => {
        if (syncingRef.current) return true;
        const src = gantt.getTask(link.source);
        const tgt = gantt.getTask(link.target);
        // dhtmlx tells us which ends were connected — translate to our type
        const typeMap: Record<string, LinkModal["linkType"]> = { "0": "fs", "1": "ss", "2": "ff", "3": "sf" };
        setLinkModal({
          sourceId: link.source, targetId: link.target,
          sourceName: src?.text || "Task", targetName: tgt?.text || "Task",
          linkType: typeMap[String(link.type)] || "fs", lag: 0,
        });
        return false; // block auto-add; we add via API on confirm
      });

      gantt.attachEvent("onAfterLinkDelete", async (id: any) => {
        if (syncingRef.current) return;
        const response = await authenticatedFetch(`/api/projects/${projectId}/links/${id}`, {
          method: "DELETE", headers: { "content-type": "application/json" },
          body: JSON.stringify({ planVersion: planVersionRef.current }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) setMessage(payload?.error?.message || "The dependency was not removed.");
        await reload();
      });

      await reload();
      try { gantt.showDate(new Date()); } catch {}
      if (!cancelled) setReady(true);
    }

    init();
    return () => {
      cancelled = true;
      if (ganttRef.current) { try { ganttRef.current.clearAll(); } catch {} }
    };
  }, [projectId, reload]);

  // ---- Save handler for the Task popup ----
  async function saveTask() {
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
      if (!response.ok) { setMessage(j?.error?.message || "The Task was not created."); return; }
      taskId = j.id;
    } else {
      response = await authenticatedFetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(j?.error?.message || "The Task was not saved."); return; }
    }
    setTaskModal(null);
    setMessage(`${taskModal.text.trim()} was saved and the Project Plan was recalculated.`);
    await reload();
  }

  async function deleteTask() {
    if (!taskModal || taskModal.mode !== "edit") { setTaskModal(null); return; }
    const response = await authenticatedFetch(`/api/projects/${projectId}/tasks/${taskModal.id}`, {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify({ planVersion: planVersionRef.current, version: taskModal.version }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload?.error?.message || "The Task was not deleted."); return; }
    setTaskModal(null);
    setMessage(`${taskModal.text} and its dependency links were deleted. The remaining Plan was recalculated.`);
    await reload();
  }

  // ---- Save handler for the Link popup ----
  async function saveLink() {
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
      setLinkModal(null);
      setMessage("The dependency was saved and every affected Task was recalculated.");
      await reload();
    } else {
      setMessage(payload?.error?.message || "The dependency could not be created.");
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

  return (
    <div className="bg-white border rounded shadow-sm" data-testid="persistent-gantt">
      <div className="px-4 py-2 border-b flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Project Plan</h2>
          {canEdit && (
            <button
              onClick={() => {
                const gantt = ganttRef.current;
                const todayIso = gantt ? isoFromDate(gantt, new Date()) : new Date().toISOString().slice(0, 10);
                setTaskModal({
                  mode: "add", id: null, text: "", start_date: todayIso,
                  duration: 1, color: COLORS[0], parent: 0,
                  resourceIds: [], version: 1, isHeader: false, isRoot: false,
                  allowSaturday: false, allowSunday: false, progress: 0,
                  categoryId: null, externalVisible: false, isTemp: false,
                });
              }}
              className="bg-blue-700 text-white text-sm px-3 py-1 rounded font-semibold hover:bg-blue-800"
            >
              + Add Task
            </button>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {canEdit
            ? "Double-click a bar to edit · Drag bars to reschedule · Drag from a bar's edge circle to another bar to link them"
            : "View only. Ask an Admin for edit access to change the schedule."}
        </div>
      </div>
      {message && <div role="status" className="m-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">{message}</div>}
      <div ref={containerRef} style={{ width: "100%", height: 580 }} />

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
              Header Task (dates and progress are derived from descendant leaf Tasks)
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
                <input aria-label="Task Progress" type="number" min={0} max={100} value={Math.round(taskModal.progress * 100)} onChange={event => updateTaskModal({ progress: Math.max(0, Math.min(100, Number(event.target.value))) / 100 })} className="mt-1 w-full rounded border px-3 py-2" />
              </label>
              <label className="text-sm">Resource Category
                <select aria-label="Resource Category" value={taskModal.categoryId ?? ""} onChange={event => updateTaskModal({ categoryId: event.target.value ? Number(event.target.value) : null })} className="mt-1 w-full rounded border px-3 py-2">
                  <option value="">Choose Category</option>
                  {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
            </div>}

            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={taskModal.externalVisible} onChange={event => updateTaskModal({ externalVisible: event.target.checked })} />Visible in assigned External/Client Project view</label>

            <div>
              <label className="block text-sm font-medium mb-1">Color</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map(c => (
                  <button
                    key={c} type="button"
                    onClick={() => updateTaskModal({ color: c })}
                    className={`w-7 h-7 rounded-full border-2 ${taskModal.color === c ? "border-gray-800 scale-110" : "border-white"}`}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>

            {!taskModal.isHeader && <div>
              <label className="block text-sm font-medium mb-1">Assign Resources</label>
              {resources.length === 0 ? (
                <p className="text-xs text-gray-500 bg-gray-50 border rounded p-2">
                  No resources yet. Add employees, subs, or suppliers on the <b>Resources</b> page first.
                </p>
              ) : (
                <div className="max-h-40 overflow-auto border rounded p-2 space-y-2">
                  {grouped.map(g => g.members.length > 0 && (
                    <div key={g.category.id}>
                      <div className="text-xs font-semibold text-gray-500 uppercase">{g.category.name}</div>
                      {g.members.map(m => (
                        <label key={m.id} className="flex items-center gap-2 text-sm py-0.5">
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
                          {m.name}
                        </label>
                      ))}
                    </div>
                  ))}
                  {uncategorized.map(m => (
                    <label key={m.id} className="flex items-center gap-2 text-sm py-0.5">
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
                      {m.name}
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
                  onChange={() => setLinkModal({ ...linkModal, linkType: opt.value })}
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
        .gantt-header-bar .gantt_task_progress { background: #1b5380; }
        .gantt-header-bar { background: #2e75b6 !important; border-color: #1b5380 !important; }
        .gantt_task_link .gantt_line_wrapper > div { background: #f08a24 !important; }
        .gantt_task_link .gantt_link_arrow_right { border-left-color: #f08a24 !important; }
        .gantt_task_link .gantt_link_arrow_left  { border-right-color: #f08a24 !important; }
        .gantt_task_cell.weekend { background: #f0f0f0; }
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
        className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b bg-blue-800 text-white rounded-t-lg">
          <h3 className="font-semibold">{title}</h3>
          <button aria-label={`Close ${title}`} onClick={onClose} className="text-white/80 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
