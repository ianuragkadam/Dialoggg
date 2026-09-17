"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { authenticatedFetch } from "@/lib/client-fetch";
import type { ProjectTemplateUiItem } from "@/lib/project-templates-ui";

type ApiError = { error?: { message?: string; fields?: Record<string, string> } };

export default function TemplateUsePrototype({ template, projectTypes }: { template: ProjectTemplateUiItem; projectTypes: Array<{ id: number; name: string }> }) {
  const [form, setForm] = useState({ name: "", projectType: "", startDate: "", clientName: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [completed, setCompleted] = useState<{ projectId: number; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const idempotencyKey = useRef("");
  const nameRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const dirty = Object.values(form).some(Boolean);
  const modalOpen = reviewOpen || discardOpen;

  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (discardOpen) setDiscardOpen(false);
      else setReviewOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modalOpen, reviewOpen, discardOpen]);

  function update(key: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: "" }));
  }

  function review(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length > 100) nextErrors.name = "Enter a Project name of 100 characters or fewer.";
    if (!form.projectType) nextErrors.projectType = "Choose exactly one Project Type.";
    if (!form.startDate) nextErrors.startDate = "Choose the Project Start Date.";
    setErrors(nextErrors);
    if (nextErrors.name) return nameRef.current?.focus();
    if (nextErrors.projectType) return typeRef.current?.focus();
    if (nextErrors.startDate) return dateRef.current?.focus();
    setReviewOpen(true);
  }

  async function confirmProject() {
    if (busy) return;
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    setBusy(true); setPageError("");
    try {
      const response = await authenticatedFetch(`/api/v1/project-templates/${template.id}/instantiate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), projectTypeId: Number(form.projectType), startDate: form.startDate, clientName: form.clientName.trim(), idempotencyKey: idempotencyKey.current }),
      });
      const payload = await response.json() as { data?: { projectId?: number; warnings?: string[] } } & ApiError;
      if (!response.ok || !payload.data?.projectId) {
        const fields = payload.error?.fields || {};
        if (Object.keys(fields).length) {
          setErrors({ name: fields.name || "", projectType: fields.projectTypeId || "", startDate: fields.startDate || "" });
          setReviewOpen(false);
        } else setPageError(payload.error?.message || "The Project could not be created from this Template.");
        return;
      }
      setReviewOpen(false);
      setCompleted({ projectId: payload.data.projectId, warnings: payload.data.warnings || [] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setPageError("The Project could not be created. Check the connection and try again.");
    } finally { setBusy(false); }
  }

  if (completed) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-10">
        <section role="status" className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <div aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800">✓</div>
          <h1 className="mt-4 text-2xl font-bold text-slate-950">Project created from Template</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600"><strong>{form.name.trim()}</strong> now has an independent Plan copied from <strong>{template.name}</strong>, anchored on <strong>{form.startDate}</strong>.</p>
          <div className="mx-auto mt-5 max-w-xl rounded-lg border border-blue-200 bg-blue-50 p-4 text-left text-sm leading-6 text-blue-950">All copied Task progress starts at 0%. The Tasks are ordinary editable records in Dialoggg&apos;s existing original Project Plan/Gantt chart.</div>
          {!!completed.warnings.length && <div className="mx-auto mt-4 max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-left text-sm leading-6 text-amber-950"><strong>Review before assigning Resources</strong><ul className="mt-2 list-disc pl-5">{completed.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div>}
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Link href={`/projects/${completed.projectId}#plan`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">Open Project Plan</Link><Link href="/templates" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Return to Template Library</Link></div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><Link href="/templates" className="hover:text-blue-700">Project Templates</Link><span aria-hidden="true">/</span><Link href={`/templates/${template.id}`} className="hover:text-blue-700">{template.name}</Link><span aria-hidden="true">/</span><span className="font-medium text-slate-800">Use Template</span></nav>
      <div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Start Project from Template</h1><p className="mt-2 text-sm leading-6 text-slate-600">Add the Project-specific information, then confirm the Plan before anything is created.</p></div>
      <section aria-label="Instantiation behavior" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><p className="font-semibold">Independent Project Plan</p><p>Confirmation creates the Project and its Plan atomically. It never changes the saved Template or the source Project.</p></section>

      {pageError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{pageError}</p>}

      <form onSubmit={review} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <section aria-labelledby="project-identity-title" className="space-y-4"><div><h2 id="project-identity-title" className="font-bold text-slate-950">Project information</h2><p className="mt-1 text-xs leading-5 text-slate-500">Template content stays reusable; these values belong only to the new Project.</p></div>
            <div><label htmlFor="template-project-name" className="block text-sm font-bold text-slate-800">Project name <span aria-hidden="true" className="text-red-600">*</span></label><input ref={nameRef} id="template-project-name" value={form.name} onChange={event => update("name", event.target.value)} aria-required="true" aria-invalid={!!errors.name} aria-describedby={errors.name ? "template-project-name-error" : undefined} maxLength={100} placeholder="Example: Johnson Residence" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200" />{errors.name && <p id="template-project-name-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.name}</p>}</div>
            <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="template-project-type" className="block text-sm font-bold text-slate-800">Project Type <span aria-hidden="true" className="text-red-600">*</span></label><select ref={typeRef} id="template-project-type" value={form.projectType} onChange={event => update("projectType", event.target.value)} aria-required="true" aria-invalid={!!errors.projectType} aria-describedby={errors.projectType ? "template-project-type-error" : undefined} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"><option value="">Choose a type</option>{projectTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select>{errors.projectType && <p id="template-project-type-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.projectType}</p>}{!projectTypes.length && <p className="mt-2 text-sm text-amber-800">Create a Project Type before using this Template.</p>}</div><div><label htmlFor="template-start-date" className="block text-sm font-bold text-slate-800">Project Start Date <span aria-hidden="true" className="text-red-600">*</span></label><input ref={dateRef} id="template-start-date" type="date" value={form.startDate} onChange={event => update("startDate", event.target.value)} aria-required="true" aria-invalid={!!errors.startDate} aria-describedby={errors.startDate ? "template-start-date-error" : "template-start-date-help"} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200" /><p id="template-start-date-help" className="mt-1 text-xs text-slate-500">Day 0 of the saved Plan.</p>{errors.startDate && <p id="template-start-date-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.startDate}</p>}</div></div>
            <div><label htmlFor="template-client-name" className="block text-sm font-bold text-slate-800">Client name <span className="font-normal text-slate-400">(optional)</span></label><input id="template-client-name" value={form.clientName} onChange={event => update("clientName", event.target.value)} placeholder="Client for this Project only" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200" /></div>
          </section>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"><strong className="block">What happens after confirmation</strong>Task dates are calculated from the selected Start Date. Progress resets to 0%. The resulting Tasks become ordinary editable Tasks in the existing original Project Plan/Gantt chart. Later edits never change this Template.</div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => dirty ? setDiscardOpen(true) : window.location.assign("/templates")} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">Review Project setup</button></div>
        </div>

        <aside className="h-fit space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="selected-template-title"><div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">Selected Template</span><h2 id="selected-template-title" className="mt-3 text-lg font-bold text-slate-950">{template.name}</h2><p className="mt-1 text-xs text-slate-500">Saved from {template.sourceProject}</p></div><dl className="space-y-3 border-t border-slate-200 pt-4 text-sm"><div className="flex justify-between"><dt className="text-slate-500">Tasks</dt><dd className="font-semibold">{template.taskCount}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Headers</dt><dd className="font-semibold">{template.headerCount}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Working days</dt><dd className="font-semibold">{template.workingDays}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Categories</dt><dd className="font-semibold">{template.categoryCount}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Starting progress</dt><dd className="font-semibold text-emerald-700">0%</dd></div></dl><Link href={`/templates/${template.id}`} className="inline-flex text-sm font-bold text-blue-700 hover:text-blue-900">View Template details →</Link></aside>
      </form>

      {reviewOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={event => { if (!busy && event.target === event.currentTarget) setReviewOpen(false); }}><div role="dialog" aria-modal="true" aria-labelledby="review-project-setup-title" aria-describedby="review-project-setup-description" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-xl">📋</div><h2 id="review-project-setup-title" className="mt-4 text-xl font-bold text-slate-950">Confirm Project setup</h2><p id="review-project-setup-description" className="mt-2 text-sm leading-6 text-slate-600">Review the values that will anchor the copied Project Plan.</p><dl className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 text-sm"><div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">Project</dt><dd className="text-right font-semibold">{form.name.trim()}</dd></div><div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">Project Type</dt><dd className="font-semibold">{projectTypes.find(type => String(type.id) === form.projectType)?.name}</dd></div><div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">Start Date</dt><dd className="font-semibold">{form.startDate}</dd></div><div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">Template</dt><dd className="text-right font-semibold">{template.name}</dd></div><div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">Copied Tasks</dt><dd className="font-semibold">{template.taskCount} at 0%</dd></div></dl><div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-950">Confirmation creates an independent Project and opens it in the original Gantt chart. The operation is atomic and safe to retry.</div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setReviewOpen(false)} disabled={busy} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">Back to edit</button><button type="button" onClick={confirmProject} disabled={busy} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">{busy ? "Creating…" : "Create Project"}</button></div></div></div>}
      {discardOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="discard-project-setup-title" aria-describedby="discard-project-setup-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl">!</div><h2 id="discard-project-setup-title" className="mt-4 text-xl font-bold text-slate-950">Leave Project setup?</h2><p id="discard-project-setup-description" className="mt-2 text-sm leading-6 text-slate-600">The Project name, type, Start Date, and client information will be discarded.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setDiscardOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Keep editing</button><Link href="/templates" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-600">Discard and leave</Link></div></div></div>}
    </div>
  );
}
