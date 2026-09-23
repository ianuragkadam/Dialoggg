"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { authenticatedFetch } from "@/lib/client-fetch";
import type { CompanyAdminUiItem } from "@/lib/company-admin-ui";
import PaginationControls, { pageItems } from "@/components/PaginationControls";

type StatusFilter = "all" | "active" | "suspended";

export default function CompaniesPrototype({ initialItems }: { initialItems: CompanyAdminUiItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [statusTarget, setStatusTarget] = useState<CompanyAdminUiItem | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const triggerRef = useRef<HTMLElement | null>(null);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return items.filter(item => {
      const matchesQuery = `${item.name} ${item.ownerName} ${item.ownerEmail}`.toLocaleLowerCase().includes(normalized);
      return matchesQuery && (statusFilter === "all" || item.status === statusFilter);
    });
  }, [items, query, statusFilter]);
  const visibleItems = pageItems(filteredItems, page);
  const active = items.filter(item => item.status === "active").length;
  const suspended = items.length - active;

  useEffect(() => { setPage(1); }, [query, statusFilter]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!statusTarget) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeStatusDialog();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  });

  function openStatusDialog(item: CompanyAdminUiItem, event: React.MouseEvent<HTMLButtonElement>) {
    triggerRef.current = event.currentTarget;
    setStatusTarget(item);
  }

  function closeStatusDialog() {
    setStatusTarget(null);
    const trigger = triggerRef.current;
    window.setTimeout(() => trigger?.focus(), 0);
  }

  async function confirmStatusChange() {
    if (!statusTarget) return;
    setSaving(true);
    setError("");
    const nextStatus = statusTarget.status === "active" ? "suspended" : "active";
    try {
      const action = nextStatus === "active" ? "restore" : "suspend";
      const response = await authenticatedFetch(`/api/v1/platform/companies/${statusTarget.id}/${action}`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message || "The company status could not be changed.");
      setItems(current => current.map(item => item.id === statusTarget.id
        ? { ...item, status: nextStatus, googleStatus: "Paused" }
        : item));
      setToast(nextStatus === "active" ? `${statusTarget.name} was restored. Google synchronization remains paused for review.` : `${statusTarget.name} was suspended and company sessions were revoked.`);
      closeStatusDialog();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The company status could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500"><span>Platform Administration</span><span aria-hidden="true" className="px-2">/</span><span className="font-medium text-slate-800">Companies</span></nav>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Companies</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Provision and monitor separate Dialoggg company accounts without entering their private business data.</p></div><div className="flex flex-wrap gap-2"><Link href="/platform/integration-setup" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-700 bg-white px-4 py-2.5 text-sm font-bold text-blue-800 shadow-sm hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">Integration setup access</Link><Link href="/platform/companies/new" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"><span aria-hidden="true" className="mr-2 text-lg">+</span>Add Company</Link></div></div>
      <section aria-label="Lifecycle notice" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><p className="font-semibold">Live platform operations</p><p>Company status changes take effect immediately. Suspension revokes company sessions, pauses Google synchronization, preserves Dialoggg data, and leaves Microsoft folders unchanged.</p></section>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div>}

      <section aria-label="Company summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Companies</p><p className="mt-1 text-2xl font-bold text-slate-950">{items.length}</p></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"><p className="text-sm text-emerald-800">Active</p><p className="mt-1 text-2xl font-bold text-emerald-950">{active}</p></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm"><p className="text-sm text-amber-800">Suspended</p><p className="mt-1 text-2xl font-bold text-amber-950">{suspended}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Active Projects</p><p className="mt-1 text-2xl font-bold text-slate-950">{items.reduce((sum, item) => sum + item.activeProjects, 0)}</p></div></section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="companies-list-title">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 id="companies-list-title" className="font-bold text-slate-950">Platform companies</h2><p className="mt-1 text-sm text-slate-500">Company records are operational metadata, not permission to inspect tenant content.</p></div><div className="grid gap-3 sm:grid-cols-[minmax(240px,1fr)_170px]"><div><label htmlFor="company-search" className="sr-only">Search companies</label><input id="company-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search company or Owner" className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200" /></div><div><label htmlFor="company-status-filter" className="sr-only">Filter companies by status</label><select id="company-status-filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div></div></div>
        {visibleItems.length === 0 ? <div className="px-6 py-14 text-center"><div aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">🏢</div><h3 className="mt-4 font-bold text-slate-950">No matching companies</h3><p className="mt-1 text-sm text-slate-500">Change the search or status filter to see more companies.</p><button type="button" onClick={() => { setQuery(""); setStatusFilter("all"); }} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Clear filters</button></div> : <div className="divide-y divide-slate-200">{visibleItems.map(item => <article key={item.id} className="grid gap-4 p-5 hover:bg-slate-50 lg:grid-cols-[minmax(240px,1.4fr)_minmax(180px,1fr)_220px_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold text-slate-950">{item.name}</h3><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{item.status === "active" ? "Active" : "Suspended"}</span></div><p className="mt-1 text-xs text-slate-500">Created {item.createdLabel} · {item.timeZone}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">First Owner</p><p className="mt-1 text-sm font-semibold text-slate-800">{item.ownerName}</p><p className="truncate text-xs text-slate-500">{item.ownerEmail}</p></div><dl className="grid grid-cols-3 gap-2 text-center"><div><dt className="text-xs text-slate-500">Users</dt><dd className="font-bold text-slate-900">{item.users}</dd></div><div><dt className="text-xs text-slate-500">Resources</dt><dd className="font-bold text-slate-900">{item.resources}</dd></div><div><dt className="text-xs text-slate-500">Projects</dt><dd className="font-bold text-slate-900">{item.activeProjects}</dd></div></dl><div className="flex flex-wrap gap-2 lg:justify-end"><Link href={`/platform/companies/${item.id}`} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600">View</Link><button type="button" onClick={event => openStatusDialog(item, event)} aria-label={`${item.status === "active" ? "Suspend" : "Restore"} ${item.name}`} className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 ${item.status === "active" ? "border-amber-300 bg-white text-amber-800 focus:ring-amber-600" : "border-emerald-300 bg-white text-emerald-800 focus:ring-emerald-600"}`}>{item.status === "active" ? "Suspend" : "Restore"}</button></div></article>)}</div>}
        <PaginationControls page={page} totalItems={filteredItems.length} onPageChange={setPage} label="companies" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="platform-boundary-title"><h2 id="platform-boundary-title" className="font-bold text-slate-950">Platform access boundary</h2><div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3"><p className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-900">Separate role</strong>Platform Administrator is not a company Owner or Admin.</p><p className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-900">Metadata only by default</strong>Counts and connection health do not expose Project names or schedules.</p><p className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-900">Recoverable lifecycle</strong>Suspension preserves all data and never removes Microsoft folders.</p></div></section>
      {toast && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[70] max-w-md rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl"><span aria-hidden="true" className="mr-2 text-emerald-400">✓</span>{toast}</div>}
      {statusTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={event => { if (!saving && event.target === event.currentTarget) closeStatusDialog(); }}><div role="alertdialog" aria-modal="true" aria-labelledby="company-status-title" aria-describedby="company-status-description" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className={`flex h-11 w-11 items-center justify-center rounded-full text-xl ${statusTarget.status === "active" ? "bg-amber-100" : "bg-emerald-100"}`}>!</div><h2 id="company-status-title" className="mt-4 text-xl font-bold text-slate-950">{statusTarget.status === "active" ? "Suspend company?" : "Restore company?"}</h2>{statusTarget.status === "active" ? <div id="company-status-description" className="mt-2 space-y-3 text-sm leading-6 text-slate-600"><p><strong className="text-slate-900">{statusTarget.name}</strong> will be locked for company Users.</p><ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950"><li>• Dialoggg data is preserved.</li><li>• Google synchronization pauses.</li><li>• OneDrive and SharePoint folders are not renamed or deleted.</li><li>• A Platform Administrator can restore access later.</li></ul><p className="text-xs font-semibold text-emerald-800">Approved in follow-up requirement `FUP-012`.</p></div> : <p id="company-status-description" className="mt-2 text-sm leading-6 text-slate-600"><strong className="text-slate-900">{statusTarget.name}</strong> will return to Active. Company Users can enter again; integration health remains paused until it is reviewed.</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus disabled={saving} onClick={closeStatusDialog} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">Cancel</button><button type="button" disabled={saving} onClick={confirmStatusChange} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 disabled:opacity-60 ${statusTarget.status === "active" ? "bg-amber-700 focus:ring-amber-600" : "bg-emerald-700 focus:ring-emerald-600"}`}>{saving ? "Saving…" : statusTarget.status === "active" ? "Suspend company" : "Restore company"}</button></div></div></div>}
    </div>
  );
}
