"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { authenticatedFetch } from "@/lib/client-fetch";
import type { ProjectTemplateUiItem } from "@/lib/project-templates-ui";
import PaginationControls, { pageItems } from "@/components/PaginationControls";
import HowItWorks from "@/components/HowItWorks";
import TimedNotice from "@/components/TimedNotice";

type ApiError = { error?: { message?: string; fields?: Record<string, string> } };
const PROJECT_TEMPLATES_GUIDE = [
  "A Template is a saved Task list you can reuse, so you do not rebuild the same plan for every job. Click + Save Project as Template, pick a Project you have already set up, and name the Template. The original Project does not change.",
  "A Template saves your Tasks and Headers, how long each takes, how they are linked, your weekend settings, and the default Resource Category for each Task. It saves days from the start, not calendar dates, and progress starts at 0% on every new Project.",
  "Also save current Resource assignments is optional and off by default. If you leave it off, new Projects get only the Category (Employee, Subcontractor, and so on), and you pick the people for each job. If you turn it on, the specific people and equipment are saved too. Anyone who is inactive or missing never stops a Project from being created.",
  "To start a job from a Template, click Use Template. Enter the Project name, type, and start date, and Dialoggg builds the whole plan from that date, with every Task and link shifted to match. The new plan is a normal one you can edit freely, and your changes never affect the Template.",
  "View shows what is saved in a Template. Templates cannot be edited. To change one, update a Project Plan the way you want it, save it as a new Template, and delete the old one.",
  "Rename and Delete change the Template only. Projects already created from it are not affected.",
];

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}

export default function ProjectTemplatesPrototype({ initialItems }: { initialItems: ProjectTemplateUiItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [renameTarget, setRenameTarget] = useState<ProjectTemplateUiItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectTemplateUiItem | null>(null);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const [page, setPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredItems = useMemo(
    () => items.filter(item => `${item.name} ${item.sourceProject}`.toLocaleLowerCase().includes(normalizedQuery)),
    [items, normalizedQuery],
  );
  const visibleItems = pageItems(filteredItems, page);
  const totalTasks = items.reduce((sum, item) => sum + item.taskCount, 0);
  const modalOpen = !!renameTarget || !!deleteTarget || discardOpen;

  useEffect(() => {
    if (renameTarget && !discardOpen) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [renameTarget, discardOpen]);

  useEffect(() => { setPage(1); }, [normalizedQuery]);

  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (discardOpen) setDiscardOpen(false);
      else if (renameTarget) requestRenameClose();
      else closeDelete();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  });

  function rememberTrigger(target: EventTarget | null) {
    triggerRef.current = target instanceof HTMLElement ? target : null;
  }

  function restoreFocus() {
    const trigger = triggerRef.current;
    window.setTimeout(() => trigger?.focus(), 0);
  }

  function openRename(item: ProjectTemplateUiItem, event: React.MouseEvent<HTMLButtonElement>) {
    rememberTrigger(event.currentTarget);
    setRenameTarget(item);
    setDraftName(item.name);
    setError("");
  }

  function closeRename() {
    setRenameTarget(null);
    setDraftName("");
    setError("");
    setDiscardOpen(false);
    restoreFocus();
  }

  function requestRenameClose() {
    if (renameTarget && draftName.trim() !== renameTarget.name) setDiscardOpen(true);
    else closeRename();
  }

  async function saveRename(event: React.FormEvent) {
    event.preventDefault();
    if (!renameTarget || busy) return;
    const name = draftName.trim();
    if (!name) return setError("Enter a Template name.");
    if (name.length > 80) return setError("Use 80 characters or fewer.");
    if (items.some(item => item.id !== renameTarget.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return setError(`A Template named “${name}” already exists.`);
    }
    const previousName = renameTarget.name;
    setBusy(true); setError(""); setPageError("");
    try {
      const response = await authenticatedFetch(`/api/v1/project-templates/${renameTarget.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const payload = await response.json() as { data?: { projectTemplate?: ProjectTemplateUiItem } } & ApiError;
      if (!response.ok || !payload.data?.projectTemplate) {
        setError(payload.error?.fields?.name || payload.error?.message || "The Project Template could not be renamed.");
        return;
      }
      setItems(current => current.map(item => item.id === renameTarget.id ? payload.data!.projectTemplate! : item));
      setToast(`${previousName} was renamed to ${name}. Existing Projects were not changed.`);
      closeRename();
    } catch {
      setError("The Project Template could not be renamed. Check the connection and try again.");
    } finally { setBusy(false); }
  }

  function openDelete(item: ProjectTemplateUiItem, event: React.MouseEvent<HTMLButtonElement>) {
    rememberTrigger(event.currentTarget);
    setDeleteTarget(item);
  }

  function closeDelete() {
    setDeleteTarget(null);
    restoreFocus();
  }

  async function confirmDelete() {
    if (!deleteTarget || busy) return;
    const target = deleteTarget;
    setBusy(true); setPageError("");
    try {
      const response = await authenticatedFetch(`/api/v1/project-templates/${target.id}`, { method: "DELETE" });
      const payload = await response.json() as ApiError;
      if (!response.ok) {
        setPageError(payload.error?.message || "The Project Template could not be deleted.");
        setDeleteTarget(null);
        return;
      }
      setItems(current => current.filter(item => item.id !== target.id));
      setDeleteTarget(null);
      setToast(`${target.name} was deleted. Existing Projects were not changed.`);
      restoreFocus();
    } catch {
      setPageError("The Project Template could not be deleted. Check the connection and try again.");
      setDeleteTarget(null);
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Project Templates</h1>
        </div>
        <Link href="/templates/new" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
          <span aria-hidden="true" className="mr-2 text-lg">+</span>Save Project as Template
        </Link>
      </div>

      <HowItWorks items={PROJECT_TEMPLATES_GUIDE} />

      {pageError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{pageError}</p>}

      <section aria-label="Template summary" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-medium text-slate-500">Company Templates</p><p className="mt-1 text-2xl font-bold text-slate-950">{items.length}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-medium text-slate-500">Reusable Tasks</p><p className="mt-1 text-2xl font-bold text-slate-950">{totalTasks}</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"><p className="text-sm font-medium text-emerald-800">Progress copied</p><p className="mt-1 text-2xl font-bold text-emerald-950">0%</p></div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="template-library-title">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 id="template-library-title" className="font-bold text-slate-950">Template Library</h2><p className="mt-1 text-sm text-slate-500">Only your company&apos;s Templates appear here.</p></div>
          <div className="relative w-full sm:w-80">
            <label htmlFor="template-search" className="sr-only">Search Project Templates</label>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400"><SearchIcon /></span>
            <input id="template-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search Templates or source Projects" className="min-h-11 w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200" />
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">📋</div>
            <h3 className="mt-4 font-bold text-slate-950">{items.length ? "No matching Templates" : "No Templates saved yet"}</h3>
            <p className="mt-1 text-sm text-slate-500">{items.length ? `No Template or source Project matches “${query.trim()}”.` : "Save a proven company Project Plan to build the reusable library."}</p>
            {items.length ? <button type="button" onClick={() => setQuery("")} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">Clear search</button> : <Link href="/templates/new" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">Save Project as Template</Link>}
          </div>
        ) : (
          <div className="grid gap-4 p-4 lg:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map(item => (
              <article key={item.id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="truncate text-lg font-bold text-slate-950">{item.name}</h3><p className="mt-1 truncate text-xs text-slate-500">Saved from {item.sourceProject}</p></div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">Template</span>
                </div>
                <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Tasks</dt><dd className="mt-1 font-bold text-slate-900">{item.taskCount}</dd></div>
                  <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Days</dt><dd className="mt-1 font-bold text-slate-900">{item.workingDays}</dd></div>
                  <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Categories</dt><dd className="mt-1 font-bold text-slate-900">{item.categoryCount}</dd></div>
                </dl>
                <p className="mt-4 text-xs text-slate-500">Updated {item.updatedLabel}</p>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <Link href={`/templates/${item.id}`} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600">View</Link>
                  <Link href={`/templates/${item.id}/use`} className="min-h-10 rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600">Use Template</Link>
                  <button type="button" onClick={event => openRename(item, event)} aria-label={`Rename ${item.name}`} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600">Rename</button>
                  <button type="button" onClick={event => openDelete(item, event)} aria-label={`Delete ${item.name}`} className="min-h-10 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-600">Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
        <PaginationControls page={page} totalItems={filteredItems.length} onPageChange={setPage} label="Templates" />
      </section>

      {toast && <div className="fixed bottom-5 right-5 z-[70] w-[min(28rem,calc(100vw-2.5rem))]"><TimedNotice message={toast} onDismiss={() => setToast("")} /></div>}

      {renameTarget && !discardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={event => { if (event.target === event.currentTarget) requestRenameClose(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="rename-template-title" aria-describedby="rename-template-description" className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4"><h2 id="rename-template-title" className="text-xl font-bold text-slate-950">Rename Template</h2><p id="rename-template-description" className="mt-1 text-sm text-slate-500">Change the library name for “{renameTarget.name}”.</p></div>
            <form onSubmit={saveRename} noValidate>
              <div className="space-y-4 px-5 py-5">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-950">Projects previously created from this Template will keep their existing Plans and names.</div>
                <div><label htmlFor="template-name" className="block text-sm font-bold text-slate-800">Template name <span aria-hidden="true" className="text-red-600">*</span></label><input ref={inputRef} id="template-name" value={draftName} onChange={event => { setDraftName(event.target.value); setError(""); }} aria-required="true" aria-invalid={!!error} aria-describedby={error ? "template-name-help template-name-error" : "template-name-help"} maxLength={81} className={`mt-1 min-h-11 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${error ? "border-red-500 focus:ring-red-100" : "border-slate-300 focus:border-blue-600 focus:ring-blue-200"}`} /><div className="mt-1 flex justify-between gap-3"><p id="template-name-help" className="text-xs text-slate-500">1–80 characters; unique within this company.</p><span className="text-xs text-slate-400">{draftName.length}/80</span></div>{error && <p id="template-name-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}</div>
              </div>
              <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={requestRenameClose} disabled={busy} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">{busy ? "Saving…" : "Save new name"}</button></div>
            </form>
          </div>
        </div>
      )}

      {discardOpen && renameTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="discard-template-title" aria-describedby="discard-template-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl">!</div><h2 id="discard-template-title" className="mt-4 text-xl font-bold text-slate-950">Discard unsaved changes?</h2><p id="discard-template-description" className="mt-2 text-sm leading-6 text-slate-600">The new Template name has not been saved.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setDiscardOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Keep editing</button><button type="button" onClick={closeRename} className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-600">Discard changes</button></div></div></div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={event => { if (!busy && event.target === event.currentTarget) closeDelete(); }}><div role="alertdialog" aria-modal="true" aria-labelledby="delete-template-title" aria-describedby="delete-template-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-xl text-red-700">!</div><h2 id="delete-template-title" className="mt-4 text-xl font-bold text-slate-950">Delete Template?</h2><p id="delete-template-description" className="mt-2 text-sm leading-6 text-slate-600"><strong className="text-slate-900">{deleteTarget.name}</strong> will be removed from the Template Library. Existing Projects created from it will not change. This cannot be undone.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={closeDelete} disabled={busy} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">Cancel</button><button type="button" onClick={confirmDelete} disabled={busy} className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-600 disabled:opacity-60">{busy ? "Deleting…" : "Delete Template"}</button></div></div></div>
      )}
    </div>
  );
}
