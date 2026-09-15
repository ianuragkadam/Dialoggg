"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ProjectTypeItem = {
  id: string;
  name: string;
  projectCount: number;
  updatedLabel: string;
};

type EditorState = {
  mode: "create" | "rename";
  itemId?: string;
  originalName: string;
};

const INITIAL_TYPES: ProjectTypeItem[] = [
  { id: "acrylic", name: "Acrylic", projectCount: 12, updatedLabel: "September 14, 2026" },
  { id: "hardwood", name: "Hardwood", projectCount: 0, updatedLabel: "September 14, 2026" },
  { id: "modular", name: "Modular", projectCount: 2, updatedLabel: "September 14, 2026" },
];

function projectCountLabel(count: number) {
  return `${count} ${count === 1 ? "Project" : "Projects"}`;
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export default function ProjectTypesPrototype() {
  const [items, setItems] = useState<ProjectTypeItem[]>(INITIAL_TYPES);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draftName, setDraftName] = useState("");
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectTypeItem | null>(null);
  const [blockedTarget, setBlockedTarget] = useState<ProjectTypeItem | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [toast, setToast] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const nextIdRef = useRef(1);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleItems = useMemo(
    () => items
      .filter(item => item.name.toLocaleLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [items, normalizedQuery],
  );
  const assignedProjects = items.reduce((total, item) => total + item.projectCount, 0);
  const modalOpen = !!editor || !!deleteTarget || !!blockedTarget || discardOpen;

  useEffect(() => {
    if (editor && !discardOpen) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editor, discardOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (discardOpen) {
        setDiscardOpen(false);
      } else if (editor) {
        const changed = draftName.trim() !== editor.originalName;
        if (changed) setDiscardOpen(true);
        else closeEditor();
      } else {
        closeConfirmations();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modalOpen, discardOpen, editor, draftName]);

  function rememberTrigger(element: EventTarget | null) {
    lastTriggerRef.current = element instanceof HTMLElement ? element : null;
  }

  function restoreTriggerFocus() {
    const trigger = lastTriggerRef.current;
    window.setTimeout(() => trigger?.focus(), 0);
  }

  function openCreate(event: React.MouseEvent<HTMLButtonElement>) {
    rememberTrigger(event.currentTarget);
    setDraftName("");
    setFormError("");
    setEditor({ mode: "create", originalName: "" });
  }

  function openRename(item: ProjectTypeItem, event: React.MouseEvent<HTMLButtonElement>) {
    rememberTrigger(event.currentTarget);
    setDraftName(item.name);
    setFormError("");
    setEditor({ mode: "rename", itemId: item.id, originalName: item.name });
  }

  function closeEditor() {
    setEditor(null);
    setDraftName("");
    setFormError("");
    setDiscardOpen(false);
    restoreTriggerFocus();
  }

  function requestEditorClose() {
    if (!editor) return;
    if (draftName.trim() !== editor.originalName) {
      setDiscardOpen(true);
      return;
    }
    closeEditor();
  }

  function closeConfirmations() {
    setDeleteTarget(null);
    setBlockedTarget(null);
    restoreTriggerFocus();
  }

  function validateName() {
    const value = draftName.trim();
    if (!value) return "Enter a Project Type name.";
    if (value.length > 50) return "Use 50 characters or fewer.";
    const duplicate = items.some(item =>
      item.id !== editor?.itemId && item.name.toLocaleLowerCase() === value.toLocaleLowerCase(),
    );
    if (duplicate) return `A Project Type named “${value}” already exists.`;
    return "";
  }

  function saveEditor(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const error = validateName();
    if (error) {
      setFormError(error);
      inputRef.current?.focus();
      return;
    }

    const value = draftName.trim();
    if (editor.mode === "create") {
      setItems(current => [
        ...current,
        { id: `new-${nextIdRef.current++}`, name: value, projectCount: 0, updatedLabel: "Just now" },
      ]);
      setToast(`${value} was added.`);
    } else {
      const oldName = editor.originalName;
      setItems(current => current.map(item =>
        item.id === editor.itemId ? { ...item, name: value, updatedLabel: "Just now" } : item,
      ));
      setToast(`${oldName} was renamed to ${value}.`);
    }
    closeEditor();
  }

  function requestDelete(item: ProjectTypeItem, event: React.MouseEvent<HTMLButtonElement>) {
    rememberTrigger(event.currentTarget);
    if (item.projectCount > 0) setBlockedTarget(item);
    else setDeleteTarget(item);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    setItems(current => current.filter(item => item.id !== deleteTarget.id));
    setToast(`${deleteTarget.name} was deleted.`);
    setDeleteTarget(null);
    restoreTriggerFocus();
  }

  const actionButtons = (item: ProjectTypeItem) => (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={event => openRename(item, event)}
        aria-label={`Rename ${item.name}`}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
      >
        Rename
      </button>
      <button
        type="button"
        onClick={event => requestDelete(item, event)}
        aria-label={`Delete ${item.name}`}
        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:border-red-400 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
      >
        Delete
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
        <span>Settings</span>
        <span aria-hidden="true" className="px-2">/</span>
        <span className="font-medium text-slate-800">Project Types</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Project Types</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Keep the company&apos;s Project categories consistent. Each Project must use exactly one Project Type.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
        >
          <span aria-hidden="true" className="mr-2 text-lg leading-none">+</span>
          Add Project Type
        </button>
      </div>

      <section aria-label="Prototype notice" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        <p className="font-semibold">UI preview</p>
        <p>
          This screen demonstrates the complete Project Types workflow. Changes last until the page is refreshed and do not alter production Project records.
        </p>
      </section>

      <section aria-label="Project Type summary" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Project Types</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{items.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Assigned Projects</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{assignedProjects}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-sm font-medium text-emerald-800">Projects missing a type</p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">0</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="project-types-list-title">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="project-types-list-title" className="font-bold text-slate-950">Company Project Types</h2>
            <p className="mt-1 text-sm text-slate-500">Names must be unique, including differences in uppercase and lowercase letters.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <label htmlFor="project-type-search" className="sr-only">Search Project Types</label>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400"><SearchIcon /></span>
            <input
              id="project-type-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search Project Types"
              className="min-h-11 w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">🏷️</div>
            <h3 className="mt-4 font-bold text-slate-950">No matching Project Types</h3>
            <p className="mt-1 text-sm text-slate-500">No Project Type matches “{query.trim()}”. Try another name or clear the search.</p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
            >
              Clear search
            </button>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px]">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3">Project Type</th>
                    <th scope="col" className="px-5 py-3">Used by</th>
                    <th scope="col" className="px-5 py-3">Last updated</th>
                    <th scope="col" className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-semibold text-slate-950">{item.name}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        <span className={item.projectCount ? "font-semibold text-blue-700" : "text-slate-500"}>{projectCountLabel(item.projectCount)}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">{item.updatedLabel}</td>
                      <td className="px-5 py-4">{actionButtons(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-200 md:hidden">
              {visibleItems.map(item => (
                <article key={item.id} className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-slate-950">{item.name}</h3>
                      <p className="mt-1 text-sm font-semibold text-blue-700">{projectCountLabel(item.projectCount)}</p>
                    </div>
                    <span className="text-xs text-slate-500">{item.updatedLabel}</span>
                  </div>
                  {actionButtons(item)}
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="project-type-rules" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="project-type-rules" className="font-bold text-slate-950">How Project Types work</h2>
        <ul className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3">
          <li className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-900">One type per Project</strong>Every Project must always have exactly one Project Type.</li>
          <li className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-900">Company-specific</strong>Each company sees and manages only its own Project Types.</li>
          <li className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-900">Safe deletion</strong>A type in use cannot be deleted until its Projects are reassigned.</li>
        </ul>
      </section>

      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[70] max-w-sm rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl">
          <span aria-hidden="true" className="mr-2 text-emerald-400">✓</span>{toast}
        </div>
      )}

      {editor && !discardOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
          onMouseDown={event => { if (event.target === event.currentTarget) requestEditorClose(); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="project-type-editor-title" aria-describedby="project-type-editor-description" className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="project-type-editor-title" className="text-xl font-bold text-slate-950">
                  {editor.mode === "create" ? "Add Project Type" : "Rename Project Type"}
                </h2>
                <p id="project-type-editor-description" className="mt-1 text-sm text-slate-500">
                  {editor.mode === "create" ? "Create one reusable label for this company." : `Update “${editor.originalName}” everywhere it appears.`}
                </p>
              </div>
              <button type="button" aria-label="Close dialog" onClick={requestEditorClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600">
                <CloseIcon />
              </button>
            </div>
            <form onSubmit={saveEditor} noValidate>
              <div className="space-y-4 px-5 py-5">
                {editor.mode === "rename" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                    The new name will appear in All Projects and Master Calendar filters. Existing Projects remain assigned to this type.
                  </div>
                )}
                <div>
                  <label htmlFor="project-type-name" className="block text-sm font-bold text-slate-800">Project Type name <span aria-hidden="true" className="text-red-600">*</span></label>
                  <input
                    ref={inputRef}
                    id="project-type-name"
                    value={draftName}
                    onChange={event => { setDraftName(event.target.value); if (formError) setFormError(""); }}
                    aria-required="true"
                    aria-invalid={!!formError}
                    aria-describedby={formError ? "project-type-name-error project-type-name-help" : "project-type-name-help"}
                    maxLength={51}
                    placeholder="Example: Acrylic"
                    className={`mt-1 min-h-11 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${formError ? "border-red-500 focus:border-red-600 focus:ring-red-100" : "border-slate-300 focus:border-blue-600 focus:ring-blue-200"}`}
                  />
                  <div className="mt-1 flex items-start justify-between gap-3">
                    <p id="project-type-name-help" className="text-xs leading-5 text-slate-500">1–50 characters. Names must be unique regardless of capitalization.</p>
                    <span className="shrink-0 text-xs text-slate-400">{draftName.length}/50</span>
                  </div>
                  {formError && <p id="project-type-name-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{formError}</p>}
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={requestEditorClose} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">Cancel</button>
                <button type="submit" className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
                  {editor.mode === "create" ? "Add Project Type" : "Save new name"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {discardOpen && editor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="discard-title" aria-describedby="discard-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl">!</div>
            <h2 id="discard-title" className="mt-4 text-xl font-bold text-slate-950">Discard unsaved changes?</h2>
            <p id="discard-description" className="mt-2 text-sm leading-6 text-slate-600">The Project Type name you entered has not been saved.</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" autoFocus onClick={() => setDiscardOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">Keep editing</button>
              <button type="button" onClick={closeEditor} className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2">Discard changes</button>
            </div>
          </div>
        </div>
      )}

      {blockedTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={event => { if (event.target === event.currentTarget) closeConfirmations(); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="blocked-delete-title" aria-describedby="blocked-delete-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl">!</div>
            <h2 id="blocked-delete-title" className="mt-4 text-xl font-bold text-slate-950">This Project Type can&apos;t be deleted</h2>
            <p id="blocked-delete-description" className="mt-2 text-sm leading-6 text-slate-600">
              <strong className="text-slate-900">{blockedTarget.name}</strong> is used by {projectCountLabel(blockedTarget.projectCount).toLocaleLowerCase()}. Change those Projects to another type before deleting it.
            </p>
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-950">
              Nothing has been deleted. Existing Projects and their schedules are unchanged.
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" autoFocus onClick={closeConfirmations} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">Close</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={event => { if (event.target === event.currentTarget) closeConfirmations(); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-project-type-title" aria-describedby="delete-project-type-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-xl text-red-700">!</div>
            <h2 id="delete-project-type-title" className="mt-4 text-xl font-bold text-slate-950">Delete Project Type?</h2>
            <p id="delete-project-type-description" className="mt-2 text-sm leading-6 text-slate-600">
              <strong className="text-slate-900">{deleteTarget.name}</strong> is not assigned to any Projects. Deleting it cannot be undone.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" autoFocus onClick={closeConfirmations} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">Cancel</button>
              <button type="button" onClick={confirmDelete} className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2">Delete Project Type</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
