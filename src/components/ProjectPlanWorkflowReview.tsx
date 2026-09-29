"use client";

import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";

type PlanTask = {
  id: number;
  text: string;
  start_date: string;
  end_date: string | null;
  duration: number;
  progress: number;
  parent: number;
  type: "project" | "task";
  is_root: boolean;
  version?: number;
};

type PlanLink = { id: number; source: number; target: number; type: "0" | "1" | "2" | "3"; lag: number };
type PlanData = { data: PlanTask[]; links: PlanLink[]; planVersion?: number; projectEndDate?: string | null };

const LINK_LABELS: Record<PlanLink["type"], string> = {
  "0": "FS", "1": "SS", "2": "FF", "3": "SF",
};

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ProjectPlanWorkflowReview({ projectId, projectName, canEdit }: { projectId: number; projectName: string; canEdit: boolean }) {
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState<Set<number> | null>(null);
  const [showRootRules, setShowRootRules] = useState(false);

  useEffect(() => {
    let current = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await authenticatedFetch(`/api/projects/${projectId}/tasks`, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error?.message || "Could not load the saved Project Plan.");
        if (!current) return;
        const next = result as PlanData;
        setPlan(next);
        setError("");
        setExpanded(previous => previous === null ? null : new Set([...previous, ...(next.data || []).filter(task => task.type === "project").map(task => task.id)]));
      } catch (cause) {
        if (current) setError(cause instanceof Error ? cause.message : "Could not load the saved Project Plan.");
      } finally {
        if (current) setLoading(false);
      }
    };
    const onPlanUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: number }>).detail;
      if (detail?.projectId === projectId) void load();
    };
    const refreshWhenVisible = () => { if (!document.hidden) void load(); };
    window.addEventListener("dialoggg:project-plan-updated", onPlanUpdated);
    window.addEventListener("focus", refreshWhenVisible);
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    void load();
    return () => {
      current = false;
      window.removeEventListener("dialoggg:project-plan-updated", onPlanUpdated);
      window.removeEventListener("focus", refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, [projectId, refreshKey]);

  const tasks = plan?.data || [];
  const byId = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const childrenByParent = useMemo(() => {
    const result = new Map<number, PlanTask[]>();
    for (const task of tasks) {
      const parentId = Number(task.parent) || 0;
      const children = result.get(parentId) || [];
      children.push(task);
      result.set(parentId, children);
    }
    return result;
  }, [tasks]);
  const root = tasks.find(task => task.is_root) || null;
  const incomingLinks = useMemo(() => {
    const result = new Map<number, PlanLink[]>();
    for (const link of plan?.links || []) {
      const links = result.get(link.target) || [];
      links.push(link);
      result.set(link.target, links);
    }
    return result;
  }, [plan?.links]);

  function toggle(taskId: number) {
    setExpanded(current => {
      const next = new Set(current ?? tasks.filter(task => task.type === "project").map(task => task.id));
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function editInGantt(task: PlanTask) {
    document.querySelector('[data-testid="persistent-gantt"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.dispatchEvent(new CustomEvent("dialoggg:open-plan-task", { detail: { projectId, taskId: task.id } }));
  }

  function renderTask(task: PlanTask, depth: number): React.ReactNode {
    const isHeader = task.type === "project";
    const children = childrenByParent.get(task.id) || [];
    const isOpen = expanded === null || expanded.has(task.id);
    const incoming = incomingLinks.get(task.id) || [];
    const summary = isHeader
      ? `Header · derived · ${Math.round((Number(task.progress) || 0) * 100)}%`
      : `${task.duration} workday${task.duration === 1 ? "" : "s"} · ${Math.round((Number(task.progress) || 0) * 100)}%`;

    return (
      <li key={task.id} className="border-t border-slate-700/80 first:border-t-0" data-testid={`live-plan-task-${task.id}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 hover:bg-slate-800/60">
          <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingLeft: `${Math.min(depth, 8) * 1.1}rem` }}>
            {isHeader && children.length > 0 ? (
              <button type="button" aria-label={`${isOpen ? "Collapse" : "Expand"} ${task.text}`} aria-expanded={isOpen} onClick={() => toggle(task.id)} className="rounded px-1 text-slate-300 hover:bg-slate-700">
                <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
              </button>
            ) : <span className="w-4 shrink-0" />}
            <span className={`truncate ${isHeader ? "font-semibold text-slate-100" : "text-slate-200"}`}>{task.text}</span>
            {task.is_root && <span className="rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">Project root</span>}
          </div>
          <span className="shrink-0 text-xs text-slate-300 sm:min-w-44 sm:text-right">
            {summary}<span className="block text-[11px] text-slate-400">{formatDate(task.start_date)} – {formatDate(task.end_date)}</span>
          </span>
          {canEdit && !task.is_root && <button type="button" onClick={() => editInGantt(task)} className="rounded border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-100 hover:border-indigo-300 hover:bg-slate-700">Edit in Gantt</button>}
        </div>
        {incoming.length > 0 && <div className="flex flex-wrap gap-1 px-3 pb-2" style={{ paddingLeft: `${Math.min(depth + 1, 8) * 1.1 + 1.75}rem` }}>
          {incoming.map(link => <span key={link.id} className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300" data-testid={`live-plan-link-${link.id}`}>
            {LINK_LABELS[link.type] || "FS"} {link.lag > 0 ? `+${link.lag}` : "+0"} · {byId.get(link.source)?.text || "Predecessor"}
          </span>)}
        </div>}
        {isHeader && isOpen && children.length > 0 && <ul>{children.map(child => renderTask(child, depth + 1))}</ul>}
      </li>
    );
  }

  const rootChildren = root ? childrenByParent.get(root.id) || [] : [];
  const nonRootTasks = tasks.filter(task => !task.is_root);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-sm" data-testid="live-root-task-panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Project hierarchy · live data</p>
          <h2 className="font-semibold">{root?.text || projectName}</h2>
          <p className="mt-1 text-xs text-slate-400">{nonRootTasks.length} saved task{nonRootTasks.length === 1 ? "" : "s"} · {plan?.links.length || 0} dependenc{plan?.links.length === 1 ? "y" : "ies"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowRootRules(true)} disabled={!root} className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">Root task rules</button>
          <button type="button" onClick={() => setRefreshKey(value => value + 1)} className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold hover:bg-slate-800" aria-label="Refresh live Project Plan data">Refresh</button>
        </div>
      </header>

      {error && <div role="alert" className="m-3 rounded-md border border-red-400/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}
      {loading && <p role="status" className="px-4 py-5 text-sm text-slate-300">Loading saved tasks…</p>}
      {!loading && !error && root && <>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-700 bg-slate-950/30 px-4 py-2 text-xs text-slate-300">
          <span>Start: {formatDate(root.start_date)}</span>
          <span>End: {formatDate(plan?.projectEndDate || root.end_date)}</span>
          <span>Progress: {Math.round((Number(root.progress) || 0) * 100)}%</span>
        </div>
        {rootChildren.length > 0 ? <ul>{rootChildren.map(task => renderTask(task, 0))}</ul> : <p className="px-4 py-5 text-sm text-slate-300">No tasks have been added to this Project Plan yet. Use <strong>+ Add Task</strong> in the Gantt above to add the first task.</p>}
        {canEdit && <p className="border-t border-slate-700 px-4 py-2 text-xs text-slate-400">Edit or delete saved tasks in the Gantt above. Changes made there will refresh this panel.</p>}
      </>}
      {!loading && !error && !root && <p className="px-4 py-5 text-sm text-amber-200">This plan has no root task. Refresh the project plan or contact an administrator.</p>}

      {showRootRules && root && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-4" onMouseDown={() => setShowRootRules(false)}>
        <section role="dialog" aria-modal="true" aria-label="Project root task rules" className="w-full max-w-lg rounded-xl border border-slate-600 bg-slate-900 text-slate-100 shadow-2xl" onMouseDown={event => event.stopPropagation()}>
          <header className="flex items-center justify-between border-b border-slate-700 px-5 py-4"><h3 className="font-semibold">Project root task rules</h3><button type="button" aria-label="Close root task rules" onClick={() => setShowRootRules(false)} className="rounded px-2 py-1 text-xl hover:bg-slate-800">×</button></header>
          <div className="space-y-3 p-5 text-sm">
            <p><strong>{root.text}</strong> is the protected top-level task for this project.</p>
            <ul className="list-disc space-y-1 pl-5 text-slate-300">
              <li>It groups the {rootChildren.length} direct child task{rootChildren.length === 1 ? "" : "s"} shown in this live plan.</li>
              <li>Its schedule and progress are derived from its descendant tasks.</li>
              <li>The project end date is {formatDate(plan?.projectEndDate || root.end_date)}.</li>
              <li>The root cannot be deleted or moved under another task.</li>
            </ul>
          </div>
          <footer className="flex justify-end border-t border-slate-700 px-5 py-4"><button type="button" onClick={() => setShowRootRules(false)} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Close</button></footer>
        </section>
      </div>}
    </section>
  );
}
