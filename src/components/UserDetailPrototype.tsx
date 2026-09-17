"use client";

import Link from "next/link";
import { useState } from "react";

import { authenticatedFetch } from "@/lib/client-fetch";
import { companyRoleLabel, userDisplayName, userLastActiveLabel, userStatusLabel, type CompanyRoleUi, type CompanyUserUi } from "@/lib/users-access-ui";

type Dialog = "edit" | "role" | "deactivate" | "restore" | "cancel_invitation" | "resend" | null;

export default function UserDetailPrototype({ sourceUser }: { sourceUser: CompanyUserUi }) {
  const [user, setUser] = useState(sourceUser);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [draft, setDraft] = useState({ firstName: user.firstName, lastName: user.lastName, phone: user.phone, role: user.role });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const assigned = user.projects.filter(project => project.assigned);

  async function saveProfile(includeRole = false) {
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/v1/memberships/${user.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ firstName: draft.firstName, lastName: draft.lastName, phone: draft.phone, email: user.email, ...(includeRole ? { role: draft.role } : {}) }) });
      const payload = await response.json() as { data?: { user?: CompanyUserUi }; error?: { message?: string } };
      if (!response.ok || !payload.data?.user) { setError(payload.error?.message || "The User could not be updated."); return; }
      setUser(payload.data.user); setDraft(current => ({ ...current, role: payload.data!.user!.role })); setDialog(null); setMessage(includeRole ? "Role updated and prior sessions revoked." : "User details saved. Prior sessions were revoked.");
    } catch { setError("The User could not be updated. Check the connection and try again."); }
    finally { setBusy(false); }
  }
  async function lifecycle(action: "deactivate" | "restore" | "cancel_invitation") {
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/v1/memberships/${user.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json() as { data?: { user?: CompanyUserUi }; error?: { message?: string } };
      if (!response.ok || !payload.data?.user) { setError(payload.error?.message || "The membership could not be updated."); return; }
      setUser(payload.data.user); setDialog(null); setMessage(action === "cancel_invitation" ? "Invitation cancelled." : action === "deactivate" ? "User deactivated and sessions revoked." : "User restored.");
    } catch { setError("The membership could not be updated. Check the connection and try again."); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/v1/memberships/${user.id}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const payload = await response.json() as { error?: string | { message?: string } };
      if (!response.ok) { setError(typeof payload.error === "string" ? payload.error : payload.error?.message || "The invitation could not be resent."); return; }
      setDialog(null); setMessage("A new 72-hour invitation was queued; the prior link is revoked.");
    } catch { setError("The invitation could not be resent."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-5xl space-y-6 pb-10">
    <nav className="text-sm text-slate-500"><Link href="/users">Users</Link><span className="px-2">/</span>{userDisplayName(user)}</nav>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-3xl font-bold">{userDisplayName(user)}</h1><p className="mt-2 text-sm text-slate-600">Company membership · {companyRoleLabel(user.role)}</p></div><span className="rounded-full bg-slate-100 px-3 py-2 text-sm font-bold">{userStatusLabel(user.status)}</span></div>
    {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950">{message}</div>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div>}
    {!user.permissions.canEdit && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Owner approval required.</strong> This membership is visible for context, but your Role cannot modify it.</section>}
    <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><h2 className="font-bold">Identity and membership</h2>{user.permissions.canEdit && <button type="button" onClick={() => setDialog("edit")} className="text-sm font-bold text-blue-700">Edit details</button>}</div><dl className="mt-3 divide-y text-sm"><Row label="Login Email" value={user.email} /><Row label="Phone" value={user.phone || "Not provided"} /><Row label="Role" value={companyRoleLabel(user.role)} /><Row label="Status" value={userStatusLabel(user.status)} /><Row label="Last active" value={userLastActiveLabel(user)} /><Row label="Linked Resource" value={user.linkedResource ? `${user.linkedResource.name} (${user.linkedResource.status})` : "None"} /></dl>{user.permissions.canChangeRole && <div className="mt-4 flex gap-2"><select aria-label="Company Role" value={draft.role} onChange={event => setDraft(current => ({ ...current, role: event.target.value as CompanyRoleUi }))} className="min-h-11 rounded-lg border px-3">{user.permissions.allowedRoles.map(role => <option key={role} value={role}>{companyRoleLabel(role)}</option>)}</select><button type="button" disabled={draft.role === user.role} onClick={() => setDialog("role")} className="rounded-lg bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-50">Review Role change</button></div>}</section>
    <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><div><h2 className="font-bold">Project assignments</h2><p className="mt-1 text-sm text-slate-500">{user.role === "external" ? "The only Projects this External/Client can discover or open." : "Team, Common-link, and notification eligibility; Employees still see all schedules."}</p></div>{user.permissions.canAssignProjects && <Link href={`/users/${user.id}/projects`} className="text-sm font-bold text-blue-700">Edit assignments</Link>}</div><div className="mt-4 grid gap-2 sm:grid-cols-2">{assigned.length ? assigned.map(project => <div key={project.id} className="rounded-lg border p-3"><strong className="text-sm">{project.name}</strong><p className="text-xs text-slate-500">{project.projectType}</p></div>) : <p className="text-sm text-slate-500">No Project assignments.</p>}</div></section>
    {(user.permissions.canDeactivate || user.permissions.canRestore || user.permissions.canCancelInvitation || user.permissions.canResendInvitation) && <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-bold">Account actions</h2><div className="mt-3 flex flex-wrap gap-2">{user.permissions.canResendInvitation && <button type="button" onClick={() => setDialog("resend")} className="rounded-lg border px-4 py-3 text-sm font-bold text-blue-700">Resend 72-hour invitation</button>}{user.permissions.canCancelInvitation && <button type="button" onClick={() => setDialog("cancel_invitation")} className="rounded-lg border border-red-300 px-4 py-3 text-sm font-bold text-red-700">Cancel invitation</button>}{user.permissions.canDeactivate && <button type="button" onClick={() => setDialog("deactivate")} className="rounded-lg border border-amber-300 px-4 py-3 text-sm font-bold text-amber-800">Deactivate User</button>}{user.permissions.canRestore && <button type="button" onClick={() => setDialog("restore")} className="rounded-lg border border-emerald-300 px-4 py-3 text-sm font-bold text-emerald-800">Restore User</button>}</div></section>}
    {dialog === "edit" && <Modal title="Edit User details" close={() => setDialog(null)}><div className="space-y-3"><Field label="First Name" id="edit-first-name" value={draft.firstName} onChange={value => setDraft(current => ({ ...current, firstName: value }))} /><Field label="Last Name" id="edit-last-name" value={draft.lastName} onChange={value => setDraft(current => ({ ...current, lastName: value }))} /><Field label="Phone" id="edit-phone" value={draft.phone} onChange={value => setDraft(current => ({ ...current, phone: value }))} /><div><label className="text-sm font-bold" htmlFor="edit-email">Login Email</label><input id="edit-email" value={user.email} disabled className="mt-2 min-h-11 w-full rounded-lg border bg-slate-100 px-3" /><p className="mt-1 text-xs text-slate-500">A company administrator cannot replace global login identity. A verified self-service email-change flow is required.</p></div></div><Actions busy={busy} cancel={() => setDialog(null)} confirm={() => saveProfile(false)} label="Save details" /></Modal>}
    {dialog === "role" && <Modal title="Change company Role?" close={() => setDialog(null)}><p className="text-sm text-slate-600">Change {userDisplayName(user)} from {companyRoleLabel(user.role)} to {companyRoleLabel(draft.role)}. Access changes immediately and prior sessions are revoked.</p><Actions busy={busy} cancel={() => setDialog(null)} confirm={() => saveProfile(true)} label="Change Role" /></Modal>}
    {(dialog === "deactivate" || dialog === "restore" || dialog === "cancel_invitation") && <Modal title={dialog === "deactivate" ? "Deactivate User?" : dialog === "restore" ? "Restore User?" : "Cancel invitation?"} close={() => setDialog(null)} alert><p className="text-sm leading-6 text-slate-600">Historical Project, Task, Event, and Resource associations remain. Linked Resources are managed separately. Access and active sessions update immediately.</p><Actions busy={busy} cancel={() => setDialog(null)} confirm={() => lifecycle(dialog)} label={dialog === "deactivate" ? "Deactivate User" : dialog === "restore" ? "Restore User" : "Cancel invitation"} /></Modal>}
    {dialog === "resend" && <Modal title="Resend invitation?" close={() => setDialog(null)}><p className="text-sm text-slate-600">A new 72-hour single-use link replaces the previous invitation.</p><Actions busy={busy} cancel={() => setDialog(null)} confirm={resend} label="Resend invitation" /></Modal>}
  </div>;
}

function Row({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[130px_1fr] gap-3 py-3"><dt className="text-slate-500">{label}</dt><dd className="break-words font-semibold">{value}</dd></div>; }
function Field({ label, id, value, onChange }: { label: string; id: string; value: string; onChange: (value: string) => void }) { return <div><label htmlFor={id} className="text-sm font-bold">{label}</label><input id={id} value={value} onChange={event => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border px-3" /></div>; }
function Modal({ title, close, children, alert = false }: { title: string; close: () => void; children: React.ReactNode; alert?: boolean }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-xl font-bold">{title}</h2><div className="mt-4">{children}</div><button type="button" aria-label="Close dialog" onClick={close} className="sr-only">Close</button></div></div>; }
function Actions({ busy, cancel, confirm, label }: { busy: boolean; cancel: () => void; confirm: () => void; label: string }) { return <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={cancel} className="rounded-lg border px-4 py-3 text-sm font-bold">Cancel</button><button type="button" disabled={busy} onClick={confirm} className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white">{busy ? "Saving…" : label}</button></div>; }
