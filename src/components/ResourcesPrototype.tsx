"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";
import { RESOURCE_CATEGORIES, type ResourceCategoryUi, type ResourceStatusUi, type ResourceUi } from "@/lib/resources-ui";
import PaginationControls, { pageItems } from "@/components/PaginationControls";

type CategoryFilter = "all" | ResourceCategoryUi;
type StatusFilter = "all" | ResourceStatusUi;

export default function ResourcesPrototype({ initialResources, canManage }: { initialResources: ResourceUi[]; canManage: boolean }) {
  const [resources, setResources] = useState(initialResources);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [target, setTarget] = useState<ResourceUi | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => resources.filter(resource => `${resource.name} ${resource.email} ${resource.category}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (category === "all" || resource.category === category) && (status === "all" || resource.status === status)), [category, query, resources, status]);
  const visible = pageItems(filtered, page);

  useEffect(() => { if (!target) return; const before = document.body.style.overflow; document.body.style.overflow = "hidden"; const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setTarget(null); }; document.addEventListener("keydown", close); return () => { document.body.style.overflow = before; document.removeEventListener("keydown", close); }; }, [busy, target]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 4500); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { setPage(1); }, [category, query, status]);

  async function changeStatus() {
    if (!target || busy) return;
    setBusy(true); setError("");
    const action = target.status === "active" ? "deactivate" : "restore";
    const response = await authenticatedFetch(`/api/v1/resources/${target.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, version: target.version }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) { setError(payload?.error?.message || "The Resource lifecycle could not be changed."); setBusy(false); return; }
    const saved = payload.data.resource as ResourceUi;
    setResources(current => current.map(resource => resource.id === saved.id ? saved : resource));
    setToast(`${saved.name} was ${saved.status === "active" ? "restored" : "deactivated"}.`);
    setTarget(null); setBusy(false);
  }

  return <div className="mx-auto max-w-7xl space-y-6 pb-10">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><h1 className="text-3xl font-bold tracking-tight text-slate-950">Resources</h1>{canManage && <Link href="/resources/new" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">+ Add Resource</Link>}</div>
    <section aria-label="Resource summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Resources" value={resources.length} /><Summary label="Active" value={resources.filter(item => item.status === "active").length} /><Summary label="Linked Users" value={resources.filter(item => item.linkedUser).length} /><Summary label="Schedule conflicts" value={resources.flatMap(item => item.assignments).filter(item => item.conflict).length} tone="amber" /></section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="resource-directory-title">
      <div className="space-y-4 border-b border-slate-200 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="resource-directory-title" className="font-bold text-slate-950">Company Resource directory</h2>
            <p className="mt-1 text-sm text-slate-500">Categories are the approved fixed list; there is no category builder.</p>
          </div>
          <details className="group w-full sm:w-96 sm:shrink-0">
            <summary className="ml-auto flex min-h-10 w-full max-w-56 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 marker:hidden focus:outline-none focus:ring-2 focus:ring-blue-500">
              <span>Resource Guide</span>
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5"/></svg>
            </summary>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <h3 className="font-bold text-slate-900">Resource rules</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Resources represent people, crews, suppliers, equipment, or other capacity assigned to Tasks and Events.</li>
                <li>A Resource record does not grant login access. A linked User account is managed separately.</li>
                <li>Every Resource has exactly one fixed Category; Categories cannot be added, renamed, or deleted.</li>
                <li>Inactive Resources cannot be assigned to new work, while their historical assignments remain available.</li>
                <li>Schedule conflicts flag overlapping work assigned to the same Resource; resolve them by reviewing the schedule.</li>
              </ul>
            </div>
          </details>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_190px_170px]">
          <label className="sr-only" htmlFor="resource-search">Search Resources</label>
          <input id="resource-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, email, or category" className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" />
          <label className="sr-only" htmlFor="resource-category-filter">Filter Resources by Category</label>
          <select id="resource-category-filter" value={category} onChange={event => setCategory(event.target.value as CategoryFilter)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="all">All Categories</option>{RESOURCE_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select>
          <label className="sr-only" htmlFor="resource-status-filter">Filter Resources by status</label>
          <select id="resource-status-filter" value={status} onChange={event => setStatus(event.target.value as StatusFilter)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        </div>
      </div>
      {!visible.length ? <div className="px-6 py-14 text-center"><h3 className="font-bold text-slate-950">No matching Resources</h3><p className="mt-1 text-sm text-slate-500">{resources.length ? "Change the search, Category, or status filters." : "Add the first schedulable Resource for this company."}</p>{resources.length > 0 && <button type="button" onClick={() => { setQuery(""); setCategory("all"); setStatus("all"); }} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Clear filters</button>}</div> : <div className="divide-y divide-slate-200">{visible.map(resource => <article key={resource.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(220px,1.2fr)_160px_150px_170px_auto] lg:items-center"><div className="min-w-0"><h3 className="font-bold text-slate-950">{resource.name}</h3><p className="truncate text-sm text-slate-500">{resource.email || "No contact email"}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Category</p><p className="mt-1 text-sm font-semibold text-slate-800">{resource.category}</p></div><div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${resource.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{resource.status === "active" ? "Active" : "Inactive"}</span></div><div className="text-sm text-slate-600"><strong className="block text-xs uppercase tracking-wide text-slate-400">Linked User</strong>{resource.linkedUser?.name || "Not linked"}</div><div className="flex flex-wrap gap-2 lg:justify-end"><Link href={`/resources/${resource.id}`} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">View</Link>{canManage && <button type="button" aria-label={`${resource.status === "active" ? "Deactivate" : "Restore"} ${resource.name}`} onClick={() => { setError(""); setTarget(resource); }} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">{resource.status === "active" ? "Deactivate" : "Restore"}</button>}</div></article>)}</div>}
      <PaginationControls page={page} totalItems={filtered.length} onPageChange={setPage} label="Resources" />
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="categories-title"><h2 id="categories-title" className="font-bold text-slate-950">Fixed Resource Categories</h2><div className="mt-3 flex flex-wrap gap-2">{RESOURCE_CATEGORIES.map(item => <span key={item} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{item}</span>)}</div><p className="mt-3 text-sm text-slate-500">Every Resource requires exactly one Category. Categories cannot be added, renamed, or deleted.</p></section>
    {toast && <div role="status" className="fixed bottom-5 right-5 z-[70] max-w-md rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl">✓ {toast}</div>}
    {target && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role="alertdialog" aria-modal="true" aria-label={target.status === "active" ? "Deactivate Resource?" : "Restore Resource?"} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-xl font-bold text-slate-950">{target.status === "active" ? "Deactivate Resource?" : "Restore Resource?"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{target.status === "active" ? `${target.name} will be unavailable for new Task or Event assignments.` : `${target.name} will become available for new assignments again.`}</p><ul className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><li>• Historical Task and Event assignments remain visible.</li><li>• Existing Resource Calendar history is preserved.</li><li>• A linked User is not deactivated or restored automatically.</li></ul>{error && <p role="alert" className="mt-3 text-sm font-bold text-red-700">{error}</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => setTarget(null)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Cancel</button><button type="button" disabled={busy} onClick={changeStatus} className="min-h-11 rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white">{busy ? "Saving…" : target.status === "active" ? "Deactivate Resource" : "Restore Resource"}</button></div></div></div>}
  </div>;
}

function Summary({ label, value, tone = "blue" }: { label: string; value: number; tone?: "blue" | "amber" }) { return <div className={`rounded-xl border p-4 ${tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>; }
