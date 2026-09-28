"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { authenticatedFetch } from "@/lib/client-fetch";
import type { CompanyAdminUiItem } from "@/lib/company-admin-ui";
import type { CompanyActivityItem } from "@/lib/company-administration";

function healthClass(status: string) {
  if (status === "Connected") return "bg-emerald-100 text-emerald-800";
  if (status === "Attention needed") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

export default function CompanyDetailPrototype({ company, activity }: { company: CompanyAdminUiItem; activity: CompanyActivityItem[] }) {
  const [status, setStatus] = useState(company.status);
  const [expirationDate, setExpirationDate] = useState(company.expirationDate ?? "");
  const [expirationSaving, setExpirationSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialogOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dialogOpen]);

  async function confirmChange() {
    const next = status === "active" ? "suspended" : "active";
    setSaving(true);
    setError("");
    try {
      const action = next === "active" ? "restore" : "suspend";
      const response = await authenticatedFetch(`/api/v1/platform/companies/${company.id}/${action}`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message || "The company status could not be changed.");
      setStatus(next);
      setDialogOpen(false);
      setToast(next === "active" ? `${company.name} was restored. Google synchronization remains paused for review.` : `${company.name} was suspended and company sessions were revoked.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The company status could not be changed.");
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function saveExpiration(value: string) {
    setExpirationSaving(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/v1/platform/companies/${company.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ expirationDate: value || null }) });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message || "The expiration date could not be saved.");
      setExpirationDate(value);
      setToast(value ? "Expiration date updated." : "Company expiration set to Never.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The expiration date could not be saved.");
    } finally { setExpirationSaving(false); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><Link href="/platform/companies" className="hover:text-blue-700">Companies</Link><span aria-hidden="true">/</span><span className="font-medium text-slate-800">{company.name}</span></nav>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-bold tracking-tight text-slate-950">{company.name}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{status === "active" ? "Active" : "Suspended"}</span></div></div><button type="button" onClick={() => setDialogOpen(true)} className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 ${status === "active" ? "border-amber-300 bg-white text-amber-800 focus:ring-amber-600" : "border-emerald-300 bg-white text-emerald-800 focus:ring-emerald-600"}`}>{status === "active" ? "Suspend company" : "Restore company"}</button></div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div>}

      <section aria-label="Company totals" className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Company Users</p><p className="mt-1 text-2xl font-bold text-slate-950">{company.users}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Resources</p><p className="mt-1 text-2xl font-bold text-slate-950">{company.resources}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Active Projects</p><p className="mt-1 text-2xl font-bold text-slate-950">{company.activeProjects}</p></div></section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="company-profile-title"><h2 id="company-profile-title" className="font-bold text-slate-950">Company profile</h2><dl className="mt-4 divide-y divide-slate-200 text-sm"><div className="grid grid-cols-[140px_1fr] gap-4 py-3"><dt className="text-slate-500">Company Name</dt><dd className="font-semibold text-slate-900">{company.name}</dd></div><div className="grid grid-cols-[140px_1fr] gap-4 py-3"><dt className="text-slate-500">Time Zone</dt><dd className="font-semibold text-slate-900">{company.timeZone}</dd></div><div className="grid grid-cols-[140px_1fr] gap-4 py-3"><dt className="text-slate-500">Sign-up date</dt><dd className="font-semibold text-slate-900">{company.createdLabel}</dd></div><div className="grid grid-cols-[140px_1fr] gap-4 py-3"><dt className="text-slate-500">Expiration date</dt><dd className="flex flex-wrap items-center gap-2"><input aria-label="Company expiration date" type="date" value={expirationDate} disabled={expirationSaving} onChange={event => void saveExpiration(event.target.value)} className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-900" /><button type="button" disabled={expirationSaving || !expirationDate} onClick={() => void saveExpiration("")} className="rounded border border-slate-300 px-2 py-1 text-xs font-bold text-slate-700 disabled:opacity-50">Never</button></dd></div><div className="grid grid-cols-[140px_1fr] gap-4 py-3"><dt className="text-slate-500">First Owner</dt><dd><p className="font-semibold text-slate-900">{company.ownerName}</p><p className="text-xs text-slate-500">{company.ownerEmail}</p></dd></div><div className="grid grid-cols-[140px_1fr] gap-4 py-3"><dt className="text-slate-500">Company ID</dt><dd className="font-mono text-xs text-slate-700">company:{company.id}</dd></div></dl></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="integration-health-title"><h2 id="integration-health-title" className="font-bold text-slate-950">Integration health</h2><div className="mt-4 space-y-3"><div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"><div><p className="font-semibold text-slate-900">Google Calendar</p><p className="mt-1 text-xs text-slate-500">Connection summary only; no OAuth tokens are exposed.</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${healthClass(company.googleStatus)}`}>{company.googleStatus}</span></div><div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"><div><p className="font-semibold text-slate-900">Microsoft OneDrive</p><p className="mt-1 text-xs text-slate-500">Stable site/library identifiers remain private.</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${healthClass(company.oneDriveStatus)}`}>{company.oneDriveStatus}</span></div></div></section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="company-activity-title"><div className="flex items-center justify-between gap-3"><div><h2 id="company-activity-title" className="font-bold text-slate-950">Activity Log</h2><p className="mt-1 text-sm text-slate-500">Operational actions recorded for this company.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{activity.length}</span></div>{activity.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No activity has been recorded yet.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Actor</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Target</th><th className="px-3 py-2">Result</th></tr></thead><tbody className="divide-y divide-slate-100">{activity.map(item => <tr key={item.id}><td className="whitespace-nowrap px-3 py-3 text-slate-600">{new Date(item.occurredAt.includes("T") ? item.occurredAt : `${item.occurredAt.replace(" ", "T")}Z`).toLocaleString()}</td><td className="px-3 py-3 font-medium text-slate-800">{item.actor}</td><td className="px-3 py-3 font-mono text-xs text-slate-700">{item.action}</td><td className="px-3 py-3 font-mono text-xs text-slate-600">{item.target}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.result === "success" ? "bg-emerald-100 text-emerald-800" : item.result === "denied" ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-800"}`}>{item.result}</span></td></tr>)}</tbody></table></div>}</section>

      {toast && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[70] max-w-md rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl"><span aria-hidden="true" className="mr-2 text-emerald-400">✓</span>{toast}</div>}
      {dialogOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={event => { if (!saving && event.target === event.currentTarget) setDialogOpen(false); }}><div role="alertdialog" aria-modal="true" aria-labelledby="company-detail-status-title" aria-describedby="company-detail-status-description" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className={`flex h-11 w-11 items-center justify-center rounded-full text-xl ${status === "active" ? "bg-amber-100" : "bg-emerald-100"}`}>!</div><h2 id="company-detail-status-title" className="mt-4 text-xl font-bold text-slate-950">{status === "active" ? "Suspend company?" : "Restore company?"}</h2>{status === "active" ? <div id="company-detail-status-description" className="mt-2 space-y-3 text-sm leading-6 text-slate-600"><p>Company Users will be locked out of <strong className="text-slate-900">{company.name}</strong>.</p><ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950"><li>• All Dialoggg records remain stored.</li><li>• Google synchronization pauses.</li><li>• Microsoft folders stay exactly where they are.</li><li>• Restoration remains available.</li></ul><p className="text-xs font-semibold text-emerald-800">Approved in follow-up requirement `FUP-012`.</p></div> : <p id="company-detail-status-description" className="mt-2 text-sm leading-6 text-slate-600">Company access will be restored. Google synchronization stays paused until integration health is reviewed.</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus disabled={saving} onClick={() => setDialogOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">Cancel</button><button type="button" disabled={saving} onClick={confirmChange} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 disabled:opacity-60 ${status === "active" ? "bg-amber-700 focus:ring-amber-600" : "bg-emerald-700 focus:ring-emerald-600"}`}>{saving ? "Saving…" : status === "active" ? "Suspend company" : "Restore company"}</button></div></div></div>}
    </div>
  );
}
