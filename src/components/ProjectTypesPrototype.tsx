"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { authenticatedFetch } from "@/lib/client-fetch";
import PaginationControls, { pageItems } from "@/components/PaginationControls";

type AffectedProject = { id: number; name: string };
type ProjectTypeItem = {
  id: number;
  name: string;
  projectCount: number;
  updatedAt: string;
  updatedLabel: string;
  affectedProjects: AffectedProject[];
};
type EditorState = { mode: "create" | "rename"; itemId?: number; originalName: string };
type ApiError = { error?: { message?: string; fields?: { name?: string }; details?: { affectedProjects?: AffectedProject[] } } };
type ApiItem = Omit<ProjectTypeItem, "updatedLabel">;

function projectCountLabel(count: number) {
  return `${count} ${count === 1 ? "Project" : "Projects"}`;
}

function labelForTimestamp(value: string) {
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function fromApi(item: ApiItem): ProjectTypeItem {
  return { ...item, updatedLabel: labelForTimestamp(item.updatedAt) };
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18"/></svg>;
}

export default function ProjectTypesPrototype({ initialItems }: { initialItems: ProjectTypeItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draftName, setDraftName] = useState("");
  const [formError, setFormError] = useState("");
  const [pageError, setPageError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectTypeItem | null>(null);
  const [blockedTarget, setBlockedTarget] = useState<ProjectTypeItem | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [page, setPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredItems = useMemo(() => items
    .filter(item => item.name.toLocaleLowerCase().includes(normalizedQuery))
    .sort((a, b) => a.name.localeCompare(b.name)), [items, normalizedQuery]);
  const visibleItems = pageItems(filteredItems, page);
  const assignedProjects = items.reduce((total, item) => total + item.projectCount, 0);
  const modalOpen = !!editor || !!deleteTarget || !!blockedTarget || discardOpen;

  useEffect(() => { if (editor && !discardOpen) window.setTimeout(() => inputRef.current?.focus(), 0); }, [editor, discardOpen]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 4500); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { setPage(1); }, [normalizedQuery]);
  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      if (discardOpen) setDiscardOpen(false);
      else if (editor) draftName.trim() !== editor.originalName ? setDiscardOpen(true) : closeEditor();
      else closeConfirmations();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  });

  function rememberTrigger(element: EventTarget | null) { lastTriggerRef.current = element instanceof HTMLElement ? element : null; }
  function restoreTriggerFocus() { const trigger = lastTriggerRef.current; window.setTimeout(() => trigger?.focus(), 0); }
  function openCreate(event: React.MouseEvent<HTMLButtonElement>) { rememberTrigger(event.currentTarget); setDraftName(""); setFormError(""); setPageError(""); setEditor({ mode: "create", originalName: "" }); }
  function openRename(item: ProjectTypeItem, event: React.MouseEvent<HTMLButtonElement>) { rememberTrigger(event.currentTarget); setDraftName(item.name); setFormError(""); setPageError(""); setEditor({ mode: "rename", itemId: item.id, originalName: item.name }); }
  function closeEditor() { setEditor(null); setDraftName(""); setFormError(""); setDiscardOpen(false); restoreTriggerFocus(); }
  function requestEditorClose() { if (!editor || busy) return; draftName.trim() !== editor.originalName ? setDiscardOpen(true) : closeEditor(); }
  function closeConfirmations() { if (busy) return; setDeleteTarget(null); setBlockedTarget(null); restoreTriggerFocus(); }
  function validateName() {
    const value = draftName.trim().replace(/\s+/g, " ");
    if (!value) return "Enter a Project Type name.";
    if (value.length > 50) return "Use 50 characters or fewer.";
    if (items.some(item => item.id !== editor?.itemId && item.name.toLocaleLowerCase() === value.toLocaleLowerCase())) return `A Project Type named “${value}” already exists.`;
    return "";
  }

  async function saveEditor(event: React.FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    const validation = validateName();
    if (validation) { setFormError(validation); inputRef.current?.focus(); return; }
    const value = draftName.trim().replace(/\s+/g, " ");
    setBusy(true); setFormError(""); setPageError("");
    try {
      const response = await authenticatedFetch(editor.mode === "create" ? "/api/v1/project-types" : `/api/v1/project-types/${editor.itemId}`, {
        method: editor.mode === "create" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      const payload = await response.json() as { data?: { projectType?: ApiItem } } & ApiError;
      if (!response.ok || !payload.data?.projectType) {
        setFormError(payload.error?.fields?.name || payload.error?.message || "The Project Type could not be saved.");
        return;
      }
      const saved = fromApi(payload.data.projectType);
      if (editor.mode === "create") {
        setItems(current => [...current, saved]);
        setToast(`${saved.name} was added.`);
      } else {
        setItems(current => current.map(item => item.id === saved.id ? saved : item));
        setToast(`${editor.originalName} was renamed to ${saved.name}.`);
      }
      closeEditor();
    } catch {
      setFormError("The Project Type could not be saved. Check the connection and try again.");
    } finally { setBusy(false); }
  }

  function requestDelete(item: ProjectTypeItem, event: React.MouseEvent<HTMLButtonElement>) {
    rememberTrigger(event.currentTarget); setPageError("");
    item.projectCount > 0 ? setBlockedTarget(item) : setDeleteTarget(item);
  }

  async function confirmDelete() {
    if (!deleteTarget || busy) return;
    setBusy(true); setPageError("");
    try {
      const response = await authenticatedFetch(`/api/v1/project-types/${deleteTarget.id}`, { method: "DELETE" });
      const payload = await response.json() as ApiError;
      if (!response.ok) {
        if (response.status === 409) {
          const affected = payload.error?.details?.affectedProjects || [];
          setBlockedTarget({ ...deleteTarget, affectedProjects: affected, projectCount: affected.length || deleteTarget.projectCount });
          setDeleteTarget(null);
        } else {
          setPageError(payload.error?.message || "The Project Type could not be deleted.");
          setDeleteTarget(null);
        }
        return;
      }
      const deletedName = deleteTarget.name;
      setItems(current => current.filter(item => item.id !== deleteTarget.id));
      setDeleteTarget(null); setToast(`${deletedName} was deleted.`); restoreTriggerFocus();
    } catch {
      setPageError("The Project Type could not be deleted. Check the connection and try again.");
      setDeleteTarget(null);
    } finally { setBusy(false); }
  }

  const actionButtons = (item: ProjectTypeItem) => <div className="flex flex-wrap items-center justify-end gap-2">
    <button type="button" disabled={busy} onClick={event => openRename(item, event)} aria-label={`Rename ${item.name}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50">Rename</button>
    <button type="button" disabled={busy} onClick={event => requestDelete(item, event)} aria-label={`Delete ${item.name}`} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:border-red-400 hover:bg-red-50 disabled:opacity-50">Delete</button>
  </div>;

  return <div className="mx-auto max-w-6xl space-y-6 pb-10">
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500"><span>Settings</span><span aria-hidden="true" className="px-2">/</span><span className="font-medium text-slate-800">Project Types</span></nav>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Project Types</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Keep the company&apos;s Project categories consistent. Each Project must use exactly one Project Type.</p></div><button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800"><span aria-hidden="true" className="mr-2 text-lg">+</span>Add Project Type</button></div>
    <section aria-label="Live setting notice" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"><p className="font-semibold">Live company setting</p><p>Changes are saved for this company and immediately update Project and Master Calendar type labels.</p></section>
    {pageError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{pageError}</div>}
    <section aria-label="Project Type summary" className="grid gap-3 sm:grid-cols-3"><Summary label="Project Types" value={items.length}/><Summary label="Assigned Projects" value={assignedProjects}/><Summary label="Projects missing a type" value={0} green/></section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="project-types-list-title">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 id="project-types-list-title" className="font-bold text-slate-950">Company Project Types</h2><p className="mt-1 text-sm text-slate-500">Names must be unique, including differences in uppercase and lowercase letters.</p></div><div className="relative w-full sm:w-72"><label htmlFor="project-type-search" className="sr-only">Search Project Types</label><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400"><SearchIcon/></span><input id="project-type-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search Project Types" className="min-h-11 w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm"/></div></div>
      {!visibleItems.length ? <div className="px-6 py-14 text-center"><div aria-hidden="true" className="text-2xl">🏷️</div><h3 className="mt-4 font-bold text-slate-950">{items.length ? "No matching Project Types" : "No Project Types yet"}</h3><p className="mt-1 text-sm text-slate-500">{items.length ? `No Project Type matches “${query.trim()}”. Try another name or clear the search.` : "Add a Project Type before creating a Project."}</p>{items.length > 0 && <button type="button" onClick={() => setQuery("")} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Clear search</button>}</div> : <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[720px]"><thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Project Type</th><th className="px-5 py-3">Used by</th><th className="px-5 py-3">Last updated</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-200">{visibleItems.map(item => <tr key={item.id}><td className="px-5 py-4 font-semibold">{item.name}</td><td className="px-5 py-4 text-sm text-blue-700">{projectCountLabel(item.projectCount)}</td><td className="px-5 py-4 text-sm text-slate-500">{item.updatedLabel}</td><td className="px-5 py-4">{actionButtons(item)}</td></tr>)}</tbody></table></div>
        <div className="divide-y divide-slate-200 md:hidden">{visibleItems.map(item => <article key={item.id} className="space-y-4 p-4"><div className="flex items-start justify-between gap-4"><div><h3 className="font-bold">{item.name}</h3><p className="mt-1 text-sm font-semibold text-blue-700">{projectCountLabel(item.projectCount)}</p></div><span className="text-xs text-slate-500">{item.updatedLabel}</span></div>{actionButtons(item)}</article>)}</div>
      </>}
      <PaginationControls page={page} totalItems={filteredItems.length} onPageChange={setPage} label="Project Types" />
    </section>
    <section aria-labelledby="project-type-rules" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 id="project-type-rules" className="font-bold">How Project Types work</h2><ul className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3"><li className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-900">One type per Project</strong>Every Project must always have exactly one Project Type.</li><li className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-900">Company-specific</strong>Each company sees and manages only its own Project Types.</li><li className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-900">Safe deletion</strong>A type in use cannot be deleted until its Projects are reassigned.</li></ul></section>
    {toast && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[70] max-w-sm rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl"><span aria-hidden="true" className="mr-2 text-emerald-400">✓</span>{toast}</div>}

    {editor && !discardOpen && <Backdrop onClose={requestEditorClose}><div role="dialog" aria-modal="true" aria-labelledby="project-type-editor-title" className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b px-5 py-4"><div><h2 id="project-type-editor-title" className="text-xl font-bold">{editor.mode === "create" ? "Add Project Type" : "Rename Project Type"}</h2><p className="mt-1 text-sm text-slate-500">{editor.mode === "create" ? "Create one reusable label for this company." : `Update “${editor.originalName}” everywhere it appears.`}</p></div><button type="button" aria-label="Close dialog" disabled={busy} onClick={requestEditorClose} className="rounded-lg p-2"><CloseIcon/></button></div><form onSubmit={saveEditor} noValidate><div className="space-y-4 px-5 py-5">{editor.mode === "rename" && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">The new name will appear in All Projects and Master Calendar filters. Existing Projects remain assigned to this type.</div>}<div><label htmlFor="project-type-name" className="block text-sm font-bold">Project Type name <span className="text-red-600">*</span></label><input ref={inputRef} id="project-type-name" value={draftName} onChange={event => { setDraftName(event.target.value); setFormError(""); }} aria-required="true" aria-invalid={!!formError} maxLength={51} placeholder="Example: Acrylic" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/><div className="mt-1 flex justify-between gap-3"><p className="text-xs text-slate-500">1–50 characters. Names are unique regardless of capitalization.</p><span className="text-xs text-slate-400">{draftName.length}/50</span></div>{formError && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{formError}</p>}</div></div><div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={requestEditorClose} className="min-h-11 rounded-lg border px-4 py-2 text-sm font-bold">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? "Saving…" : editor.mode === "create" ? "Add Project Type" : "Save new name"}</button></div></form></div></Backdrop>}
    {discardOpen && editor && <Backdrop><div role="alertdialog" aria-modal="true" aria-label="Discard unsaved changes?" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-xl font-bold">Discard unsaved changes?</h2><p className="mt-2 text-sm text-slate-600">The Project Type name you entered has not been saved.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setDiscardOpen(false)} className="min-h-11 rounded-lg border px-4 py-2 text-sm font-bold">Keep editing</button><button type="button" onClick={closeEditor} className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white">Discard changes</button></div></div></Backdrop>}
    {blockedTarget && <Backdrop onClose={closeConfirmations}><div role="alertdialog" aria-modal="true" aria-label="This Project Type can't be deleted" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-xl font-bold">This Project Type can&apos;t be deleted</h2><p className="mt-2 text-sm leading-6 text-slate-600"><strong>{blockedTarget.name}</strong> is used by {projectCountLabel(blockedTarget.projectCount).toLocaleLowerCase()}. Change those Projects to another type before deleting it.</p>{blockedTarget.affectedProjects.length > 0 && <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-slate-200"><ul className="divide-y">{blockedTarget.affectedProjects.map(project => <li key={project.id}><Link href={`/projects/${project.id}/edit`} className="block px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">{project.name}</Link></li>)}</ul></div>}<div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">Nothing has been deleted. Existing Projects and their schedules are unchanged.</div><div className="mt-5 flex justify-end"><button type="button" autoFocus onClick={closeConfirmations} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">Close</button></div></div></Backdrop>}
    {deleteTarget && <Backdrop onClose={closeConfirmations}><div role="alertdialog" aria-modal="true" aria-label="Delete Project Type?" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-xl font-bold">Delete Project Type?</h2><p className="mt-2 text-sm leading-6 text-slate-600"><strong>{deleteTarget.name}</strong> is not assigned to any Projects. Deleting it cannot be undone.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus disabled={busy} onClick={closeConfirmations} className="min-h-11 rounded-lg border px-4 py-2 text-sm font-bold">Cancel</button><button type="button" disabled={busy} onClick={confirmDelete} className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? "Deleting…" : "Delete Project Type"}</button></div></div></Backdrop>}
  </div>;
}

function Summary({ label, value, green = false }: { label: string; value: number; green?: boolean }) {
  return <div className={`rounded-xl border p-4 shadow-sm ${green ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}><p className={`text-sm font-medium ${green ? "text-emerald-800" : "text-slate-500"}`}>{label}</p><p className={`mt-1 text-2xl font-bold ${green ? "text-emerald-950" : "text-slate-950"}`}>{value}</p></div>;
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>{children}</div>;
}
