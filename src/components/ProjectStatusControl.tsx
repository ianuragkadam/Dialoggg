"use client";

import { useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";
import { normalizeProjectStatus, type ProjectUiRecord } from "@/lib/projects-ui";

type LifecycleAction = "complete" | "restore";

export default function ProjectStatusControl({ project }: { project: ProjectUiRecord }) {
  const archived = normalizeProjectStatus(project.status) === "archived";
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function updateStatus(action: LifecycleAction) {
    setBusy(true);
    setError("");
    const response = await authenticatedFetch(`/api/v1/projects/${project.id}/lifecycle`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, version: project.version }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
    if (!response.ok) {
      setBusy(false);
      setConfirmComplete(false);
      setError(payload.error?.message || "The Project status could not be updated.");
      return;
    }
    location.assign(action === "complete" ? `/projects/${project.id}` : `/projects/${project.id}/edit`);
  }

  return <>
    <section aria-labelledby="project-status-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="project-status-heading" className="text-lg font-bold text-slate-950">Project Status</h2>
          <p className="mt-1 text-sm text-slate-600">Current status: <strong>{archived ? "Archived" : "Active"}</strong></p>
        </div>
        {archived
          ? <button type="button" disabled={busy} onClick={() => void updateStatus("restore")} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Restoring…" : "Restore to Active"}</button>
          : <button type="button" disabled={busy} onClick={() => setConfirmComplete(true)} className="min-h-11 rounded-lg border border-amber-600 px-4 py-2 text-sm font-bold text-amber-800 disabled:opacity-50">Complete Job</button>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-800">{error}</p>}
    </section>
    {confirmComplete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="complete-job-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <h2 id="complete-job-title" className="text-xl font-bold text-slate-950">Complete Job?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">Are you sure you want to mark this job complete? It will be moved to Archived.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={() => setConfirmComplete(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Cancel</button>
          <button type="button" disabled={busy} onClick={() => void updateStatus("complete")} className="min-h-11 rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Archiving…" : "Complete Job"}</button>
        </div>
      </div>
    </div>}
  </>;
}
