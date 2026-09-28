"use client";

import { useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";

export type PlatformAdministrator = {
  id: number;
  first_name: string;
  last_name: string;
  normalized_email: string;
  status: "active" | "invited" | "pending" | "deactivated";
  is_primary_platform_admin: number;
};

export default function PlatformAdministratorManagement({
  initialAdministrators,
  canManage,
}: {
  initialAdministrators: PlatformAdministrator[];
  canManage: boolean;
}) {
  const [administrators, setAdministrators] = useState(initialAdministrators);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PlatformAdministrator | null>(null);

  function validateInvitation() {
    const next: Record<string, string> = {};
    const namePattern = /^[\p{L}][\p{L}\p{M}' -]{0,79}$/u;
    const normalizedName = fullName.trim().replace(/\s+/g, " ");
    if (!namePattern.test(normalizedName) || !normalizedName.includes(" ")) next.fullName = "Enter the person’s full name.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Enter a valid email address.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!validateInvitation()) return;
    setBusy(true); setMessage(null);
    const response = await authenticatedFetch("/api/v1/platform/administrators", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName, email }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage({ ok: false, text: result.error || "The invitation could not be sent." });
    setAdministrators(current => [...current, result.administrator].sort((left, right) => right.is_primary_platform_admin - left.is_primary_platform_admin || left.first_name.localeCompare(right.first_name)));
    setFullName(""); setEmail(""); setErrors({});
    setMessage({ ok: true, text: "Invitation sent. It will expire after 72 hours if it is not accepted." });
  }

  async function confirmRemoval() {
    const administrator = pendingRemoval;
    if (!administrator) return;
    setBusy(true); setMessage(null);
    const response = await authenticatedFetch(`/api/v1/platform/administrators/${administrator.id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage({ ok: false, text: result.error || "The administrator could not be removed." });
    setAdministrators(current => current.filter(item => item.id !== administrator.id));
    setPendingRemoval(null);
    setMessage({ ok: true, text: administrator.status === "invited" ? "Platform Administrator invitation cancelled." : "Platform Administrator access removed." });
  }

  return <section className="rounded border bg-white p-6 shadow-sm" aria-labelledby="platform-administrators-heading">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 id="platform-administrators-heading" className="text-lg font-semibold">Platform Administrators</h2>
        <p className="mt-1 text-sm text-slate-600">Platform Administrators can manage companies and platform integrations. The Primary Platform Administrator manages this list.</p>
      </div>
    </div>

    <div className="mt-5 divide-y rounded border">
      {administrators.map(administrator => <div key={administrator.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-slate-950">{administrator.first_name} {administrator.last_name}</p>
          <p className="text-sm text-slate-600">{administrator.normalized_email}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            {administrator.is_primary_platform_admin === 1 && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">Primary</span>}
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{administrator.status === "invited" ? "Invitation pending" : administrator.status === "active" ? "Active" : administrator.status}</span>
          </div>
        </div>
        {canManage && administrator.is_primary_platform_admin !== 1 && <button type="button" onClick={() => setPendingRemoval(administrator)} disabled={busy} className="min-h-10 rounded border border-red-300 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">{administrator.status === "invited" ? "Cancel invitation" : "Remove"}</button>}
      </div>)}
    </div>

    {canManage ? <form onSubmit={invite} className="mt-6 rounded border border-blue-200 bg-blue-50 p-4">
      <h3 className="font-semibold text-slate-950">Invite a Platform Administrator</h3>
      <p className="mt-1 text-sm text-slate-600">They receive a secure 72-hour email invitation and create or confirm their own password.</p>
      <div className="mt-4 grid gap-3">
        <label className="text-sm font-medium">Full name<input required value={fullName} onChange={event => { setFullName(event.target.value); setErrors(current => ({ ...current, fullName: "" })); }} aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? "platform-admin-full-name-error" : undefined} className={`mt-1 block min-h-10 w-full rounded border bg-white px-3 ${errors.fullName ? "border-red-500" : ""}`} />{errors.fullName && <span id="platform-admin-full-name-error" className="mt-1 block text-xs font-normal text-red-700">{errors.fullName}</span>}</label>
        <label className="text-sm font-medium">Email address<input required type="email" value={email} onChange={event => { setEmail(event.target.value); setErrors(current => ({ ...current, email: "" })); }} aria-invalid={!!errors.email} aria-describedby={errors.email ? "platform-admin-email-error" : undefined} className={`mt-1 block min-h-10 w-full rounded border bg-white px-3 ${errors.email ? "border-red-500" : ""}`} />{errors.email && <span id="platform-admin-email-error" className="mt-1 block text-xs font-normal text-red-700">{errors.email}</span>}</label>
      </div>
      <button disabled={busy} className="mt-4 min-h-10 rounded bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{busy ? "Sending…" : "Send invitation"}</button>
    </form> : <p className="mt-5 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Only the Primary Platform Administrator can invite or remove Platform Administrators.</p>}

    {message && <p role="status" className={`mt-4 rounded p-3 text-sm ${message.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{message.text}</p>}
    {pendingRemoval && <div role="dialog" aria-modal="true" aria-labelledby="platform-admin-removal-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 id="platform-admin-removal-title" className="text-lg font-bold text-slate-950">{pendingRemoval.status === "invited" ? "Cancel invitation?" : "Remove Platform Administrator?"}</h3>
        <p className="mt-2 text-sm text-slate-600">{pendingRemoval.status === "invited" ? <>This cancels the invitation sent to <strong>{pendingRemoval.normalized_email}</strong>. They will not be able to use its link.</> : <>This immediately removes Platform Administrator access for <strong>{pendingRemoval.first_name} {pendingRemoval.last_name}</strong> and ends their active sessions. Their other company access, if any, is unchanged.</>}</p>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setPendingRemoval(null)} disabled={busy} className="min-h-10 rounded border px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Keep</button><button type="button" onClick={() => void confirmRemoval()} disabled={busy} className="min-h-10 rounded bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">{busy ? "Working…" : pendingRemoval.status === "invited" ? "Cancel invitation" : "Remove administrator"}</button></div>
      </div>
    </div>}
  </section>;
}
