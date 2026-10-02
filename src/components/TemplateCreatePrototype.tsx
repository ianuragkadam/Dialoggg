"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { authenticatedFetch } from "@/lib/client-fetch";
import type { ProjectTemplateUiItem, TemplateSourceProject } from "@/lib/project-templates-ui";

type ApiError = { error?: { message?: string; fields?: Record<string, string> } };

export default function TemplateCreatePrototype({ sourceProjects, existingNames }: { sourceProjects: TemplateSourceProject[]; existingNames: string[] }) {
  const [sourceId, setSourceId] = useState("");
  const [name, setName] = useState("");
  const [includeResources, setIncludeResources] = useState(false);
  const [errors, setErrors] = useState<{ source?: string; name?: string }>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [completed, setCompleted] = useState<ProjectTemplateUiItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const idempotencyKey = useRef("");
  const sourceRef = useRef<HTMLSelectElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const selectedSource = useMemo(() => sourceProjects.find(project => String(project.id) === sourceId), [sourceId, sourceProjects]);
  const dirty = !!sourceId || !!name || includeResources;

  useEffect(() => {
    if (!discardOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDiscardOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [discardOpen]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const nextErrors: typeof errors = {};
    if (!sourceId) nextErrors.source = "Choose the Project Plan to save.";
    const cleanName = name.trim();
    if (!cleanName) nextErrors.name = "Enter a Template name.";
    else if (cleanName.length > 80) nextErrors.name = "Use 80 characters or fewer.";
    else if (existingNames.some(existing => existing.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) nextErrors.name = `A Template named “${cleanName}” already exists.`;
    setErrors(nextErrors);
    if (nextErrors.source) return sourceRef.current?.focus();
    if (nextErrors.name) return nameRef.current?.focus();
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    setBusy(true); setPageError("");
    try {
      const response = await authenticatedFetch("/api/v1/project-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceProjectId: Number(sourceId), name: cleanName, includeResourceAssignments: includeResources, idempotencyKey: idempotencyKey.current }),
      });
      const payload = await response.json() as { data?: { template?: ProjectTemplateUiItem } } & ApiError;
      if (!response.ok || !payload.data?.template) {
        const fields = payload.error?.fields || {};
        if (fields.name || fields.sourceProjectId) {
          setErrors({ name: fields.name, source: fields.sourceProjectId });
          if (fields.sourceProjectId) sourceRef.current?.focus(); else nameRef.current?.focus();
        } else setPageError(payload.error?.message || "The Project Template could not be saved.");
        return;
      }
      setCompleted(payload.data.template);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setPageError("The Project Template could not be saved. Check the connection and try again.");
    } finally { setBusy(false); }
  }

  if (completed && selectedSource) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-10">
        <section role="status" className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm"><div aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800">✓</div><h1 className="mt-4 text-2xl font-bold text-slate-950">Template saved</h1><p className="mt-2 text-sm leading-6 text-slate-600"><strong>{completed.name}</strong> was saved from <strong>{selectedSource.name}</strong> with {completed.taskCount} Task{completed.taskCount === 1 ? "" : "s"}.</p><div className="mx-auto mt-5 max-w-xl rounded-lg border border-blue-200 bg-blue-50 p-4 text-left text-sm leading-6 text-blue-950">Dates are stored as relative working-day offsets and every future Project starts with Task progress at 0%.</div><div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Link href={`/templates/${completed.id}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">View saved Template</Link><Link href="/templates" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Return to Template Library</Link></div></section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <h1 className="text-3xl font-bold tracking-tight text-slate-950">Save Project as Template</h1>
      <section aria-label="Save behavior" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><p className="font-semibold">Persistent company Template</p><p>Saving copies the selected Project Plan atomically. The source Project remains unchanged.</p></section>

      {pageError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{pageError}</p>}

      <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div><label htmlFor="source-project" className="block text-sm font-bold text-slate-800">Source Project Plan <span className="text-red-600" aria-hidden="true">*</span></label><p id="source-help" className="mt-1 text-xs leading-5 text-slate-500">Only company Projects you can edit are available.</p><select ref={sourceRef} id="source-project" value={sourceId} onChange={event => { setSourceId(event.target.value); setErrors(current => ({ ...current, source: undefined })); }} aria-required="true" aria-invalid={!!errors.source} aria-describedby={errors.source ? "source-help source-error" : "source-help"} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"><option value="">Choose a Project</option>{sourceProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>{errors.source && <p id="source-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.source}</p>}{!sourceProjects.length && <p className="mt-2 text-sm text-amber-800">Create a Project Plan before saving a Template.</p>}</div>
          <div><label htmlFor="new-template-name" className="block text-sm font-bold text-slate-800">Template name <span className="text-red-600" aria-hidden="true">*</span></label><input ref={nameRef} id="new-template-name" value={name} onChange={event => { setName(event.target.value); setErrors(current => ({ ...current, name: undefined })); }} maxLength={81} aria-required="true" aria-invalid={!!errors.name} aria-describedby={errors.name ? "new-template-help new-template-error" : "new-template-help"} placeholder="Example: Residential Pickleball Court" className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200" /><div className="mt-1 flex justify-between"><p id="new-template-help" className="text-xs text-slate-500">1–80 characters; unique within this company.</p><span className="text-xs text-slate-400">{name.length}/80</span></div>{errors.name && <p id="new-template-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.name}</p>}</div>
          <fieldset><legend className="text-sm font-bold text-slate-800">Specific Resource assignments</legend><div className="mt-2 rounded-lg border border-slate-200 p-4"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={includeResources} onChange={event => setIncludeResources(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" /><span><span className="block text-sm font-semibold text-slate-900">Also save current Resource assignments</span><span className="mt-1 block text-xs leading-5 text-slate-500">Off by default. Resource Categories are always saved. Exact people, suppliers, subcontractors, and equipment are included only when enabled.</span></span></label></div><p className="mt-2 text-xs leading-5 text-emerald-800">Approved in `FUP-004`. Missing or inactive Resources will never block Project creation.</p></fieldset>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => dirty ? setDiscardOpen(true) : window.location.assign("/templates")} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">{busy ? "Saving…" : "Save Template"}</button></div>
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="save-summary-title"><h2 id="save-summary-title" className="font-bold text-slate-950">Save summary</h2>{selectedSource ? <dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Source</dt><dd className="text-right font-semibold text-slate-900">{selectedSource.name}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Tasks</dt><dd className="font-semibold">{selectedSource.tasks}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Working days</dt><dd className="font-semibold">{selectedSource.duration}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Categories</dt><dd className="font-semibold">{selectedSource.categories}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Exact Resources</dt><dd className="font-semibold">{includeResources ? "Included" : "Not included"}</dd></div></dl> : <p className="mt-3 text-sm leading-6 text-slate-500">Choose a source Project to preview its Plan summary.</p>}<div className="mt-5 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-900"><strong className="block">Always reset</strong>Fixed dates are converted to relative offsets and all Task progress starts at 0%.</div></aside>
      </form>

      {discardOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="discard-new-template-title" aria-describedby="discard-new-template-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl">!</div><h2 id="discard-new-template-title" className="mt-4 text-xl font-bold text-slate-950">Leave without saving?</h2><p id="discard-new-template-description" className="mt-2 text-sm leading-6 text-slate-600">Your source Project, Template name, and Resource choice will be discarded.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setDiscardOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Keep editing</button><Link href="/templates" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-600">Discard and leave</Link></div></div></div>}
    </div>
  );
}
