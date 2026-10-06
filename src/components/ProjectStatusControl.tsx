"use client";

import { useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";
import { normalizeProjectStatus, type ProjectUiRecord, type ProjectUiStatus } from "@/lib/projects-ui";

const statusLabels: Record<ProjectUiStatus, string> = {
  active: "Active",
  inactive: "Deactivated",
  completed: "Completed",
  archived: "Archived",
};

type Action = "deactivate" | "activate" | "complete" | "reopen" | "archive" | "restore";

function actionsToStatus(from: ProjectUiStatus, to: ProjectUiStatus): Action[] {
  if (from === to) return [];
  if (to === "archived") return ["archive"];
  if (from === "active") return to === "inactive" ? ["deactivate"] : ["complete"];
  if (from === "inactive") return to === "active" ? ["activate"] : ["activate", "complete"];
  if (from === "completed") return to === "active" ? ["reopen"] : ["reopen", "deactivate"];
  return to === "active" ? ["restore"] : to === "inactive" ? ["restore", "deactivate"] : ["restore", "complete"];
}

export default function ProjectStatusControl({ project }: { project: ProjectUiRecord }) {
  const currentStatus = normalizeProjectStatus(project.status);
  const [selected, setSelected] = useState<ProjectUiStatus>(currentStatus);
  const [pending, setPending] = useState<ProjectUiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveStatus() {
    if (!pending) return;
    setBusy(true);
    setError("");
    let version = project.version;
    const actions = actionsToStatus(currentStatus, pending);
    for (const action of actions) {
      const response = await authenticatedFetch(`/api/v1/projects/${project.id}/lifecycle`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, version }),
      });
      const payload = await response.json().catch(() => ({})) as { data?: { project?: ProjectUiRecord }; error?: { message?: string } };
      if (!response.ok || !payload.data?.project) {
        setBusy(false);
        setError(payload.error?.message || "The Project Status could not be updated.");
        setSelected(currentStatus);
        setPending(null);
        return;
      }
      version = payload.data.project.version;
    }
    location.assign(`/projects/${project.id}/edit`);
  }

  return <>
    <section aria-labelledby="project-status-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 id="project-status-heading" className="text-lg font-bold text-slate-950">Project Status</h2>
      <p className="mt-1 text-sm text-slate-600">Choose the current status for this Project.</p>
      <label htmlFor="project-status" className="sr-only">Project Status</label>
      <select id="project-status" value={selected} disabled={busy} onChange={event => {
        const next = event.target.value as ProjectUiStatus;
        setSelected(next);
        if (next === currentStatus) return;
        setPending(next);
      }} className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm sm:max-w-md">
        {(Object.keys(statusLabels) as ProjectUiStatus[]).map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
      </select>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-800">{error}</p>}
    </section>
    {pending && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="status-confirm-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <h2 id="status-confirm-title" className="text-xl font-bold text-slate-950">Change Project Status?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">Change <strong>{project.name}</strong> from {statusLabels[currentStatus]} to {statusLabels[pending]}? Project data and history are preserved. This change may require more than one lifecycle step.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={() => { setPending(null); setSelected(currentStatus); }} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Cancel</button>
          <button type="button" disabled={busy} onClick={() => void saveStatus()} className="min-h-11 rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Confirm Status"}</button>
        </div>
      </div>
    </div>}
  </>;
}
