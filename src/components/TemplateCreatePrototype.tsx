"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { PROJECT_TEMPLATE_UI_DATA, TEMPLATE_SOURCE_PROJECTS } from "@/lib/project-templates-ui";

export default function TemplateCreatePrototype() {
  const [sourceId, setSourceId] = useState("");
  const [name, setName] = useState("");
  const [includeResources, setIncludeResources] = useState(false);
  const [errors, setErrors] = useState<{ source?: string; name?: string }>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const sourceRef = useRef<HTMLSelectElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const selectedSource = useMemo(() => TEMPLATE_SOURCE_PROJECTS.find(project => project.id === sourceId), [sourceId]);
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

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!sourceId) nextErrors.source = "Choose the Project Plan to save.";
    const cleanName = name.trim();
    if (!cleanName) nextErrors.name = "Enter a Template name.";
    else if (cleanName.length > 80) nextErrors.name = "Use 80 characters or fewer.";
    else if (PROJECT_TEMPLATE_UI_DATA.some(template => template.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) nextErrors.name = `A Template named “${cleanName}” already exists.`;
    setErrors(nextErrors);
    if (nextErrors.source) return sourceRef.current?.focus();
    if (nextErrors.name) return nameRef.current?.focus();
    setCompleted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (completed && selectedSource) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-10">
        <section role="status" className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm"><div aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800">✓</div><h1 className="mt-4 text-2xl font-bold text-slate-950">Template preview complete</h1><p className="mt-2 text-sm leading-6 text-slate-600"><strong>{name.trim()}</strong> is ready to save from <strong>{selectedSource.name}</strong>.</p><div className="mx-auto mt-5 max-w-xl rounded-lg border border-blue-200 bg-blue-50 p-4 text-left text-sm leading-6 text-blue-950"><strong>UI preview only:</strong> no Template or Project record was created. Production persistence will be connected after the pending Resource rule is approved.</div><div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Link href="/templates" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">Return to Template Library</Link><button type="button" onClick={() => setCompleted(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Review choices</button></div></section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><Link href="/templates" className="hover:text-blue-700">Project Templates</Link><span aria-hidden="true">/</span><span className="font-medium text-slate-800">Save Project as Template</span></nav>
      <div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Save Project as Template</h1><p className="mt-2 text-sm leading-6 text-slate-600">Choose an existing Project Plan, name the reusable Template, and review exactly what will carry forward.</p></div>
      <section aria-label="Prototype notice" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><p className="font-semibold">UI preview</p><p>Submitting this form demonstrates the confirmation state only. It does not create a production Template.</p></section>

      <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div><label htmlFor="source-project" className="block text-sm font-bold text-slate-800">Source Project Plan <span className="text-red-600" aria-hidden="true">*</span></label><p id="source-help" className="mt-1 text-xs leading-5 text-slate-500">Only company Projects you can edit are available.</p><select ref={sourceRef} id="source-project" value={sourceId} onChange={event => { setSourceId(event.target.value); setErrors(current => ({ ...current, source: undefined })); }} aria-required="true" aria-invalid={!!errors.source} aria-describedby={errors.source ? "source-help source-error" : "source-help"} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"><option value="">Choose a Project</option>{TEMPLATE_SOURCE_PROJECTS.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>{errors.source && <p id="source-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.source}</p>}</div>
          <div><label htmlFor="new-template-name" className="block text-sm font-bold text-slate-800">Template name <span className="text-red-600" aria-hidden="true">*</span></label><input ref={nameRef} id="new-template-name" value={name} onChange={event => { setName(event.target.value); setErrors(current => ({ ...current, name: undefined })); }} maxLength={81} aria-required="true" aria-invalid={!!errors.name} aria-describedby={errors.name ? "new-template-help new-template-error" : "new-template-help"} placeholder="Example: Residential Pickleball Court" className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200" /><div className="mt-1 flex justify-between"><p id="new-template-help" className="text-xs text-slate-500">1–80 characters; unique within this company.</p><span className="text-xs text-slate-400">{name.length}/80</span></div>{errors.name && <p id="new-template-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.name}</p>}</div>
          <fieldset><legend className="text-sm font-bold text-slate-800">Specific Resource assignments</legend><div className="mt-2 rounded-lg border border-slate-200 p-4"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={includeResources} onChange={event => setIncludeResources(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" /><span><span className="block text-sm font-semibold text-slate-900">Also save current Resource assignments</span><span className="mt-1 block text-xs leading-5 text-slate-500">Off by default. Resource Categories are always saved. Exact people, suppliers, subcontractors, and equipment are included only when enabled.</span></span></label></div><p className="mt-2 text-xs leading-5 text-amber-800">Provisional behavior pending Scott&apos;s follow-up answer. Missing or inactive Resources will never block Project creation.</p></fieldset>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => dirty ? setDiscardOpen(true) : window.location.assign("/templates")} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Cancel</button><button type="submit" className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">Review Template</button></div>
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="save-summary-title"><h2 id="save-summary-title" className="font-bold text-slate-950">Save summary</h2>{selectedSource ? <dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Source</dt><dd className="text-right font-semibold text-slate-900">{selectedSource.name}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Tasks</dt><dd className="font-semibold">{selectedSource.tasks}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Working days</dt><dd className="font-semibold">{selectedSource.duration}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Categories</dt><dd className="font-semibold">{selectedSource.categories}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Exact Resources</dt><dd className="font-semibold">{includeResources ? "Included" : "Not included"}</dd></div></dl> : <p className="mt-3 text-sm leading-6 text-slate-500">Choose a source Project to preview its Plan summary.</p>}<div className="mt-5 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-900"><strong className="block">Always reset</strong>Fixed dates are converted to relative offsets and all Task progress starts at 0%.</div></aside>
      </form>

      {discardOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="discard-new-template-title" aria-describedby="discard-new-template-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl">!</div><h2 id="discard-new-template-title" className="mt-4 text-xl font-bold text-slate-950">Leave without saving?</h2><p id="discard-new-template-description" className="mt-2 text-sm leading-6 text-slate-600">Your source Project, Template name, and Resource choice will be discarded.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setDiscardOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Keep editing</button><Link href="/templates" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-600">Discard and leave</Link></div></div></div>}
    </div>
  );
}
