"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { authenticatedFetch } from "@/lib/client-fetch";
import { companyRoleLabel, type CompanyRoleUi, type ProjectAccessUi } from "@/lib/users-access-ui";

type FormState = { firstName: string; lastName: string; email: string; role: CompanyRoleUi; projectIds: number[]; addAsResource: boolean };
const EMPTY: FormState = { firstName: "", lastName: "", email: "", role: "employee", projectIds: [], addAsResource: false };

export default function UserInvitePrototype({ projects, canInviteElevated }: { projects: Omit<ProjectAccessUi, "assigned">[]; canInviteElevated: boolean }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(EMPTY), [form]);
  const selected = projects.filter(project => form.projectIds.includes(project.id));

  function set<K extends keyof FormState>(key: K, value: FormState[K]) { setForm(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: "" })); }
  function validate() {
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = "Enter the User's first name.";
    if (!form.lastName.trim()) next.lastName = "Enter the User's last name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Enter a valid login email address.";
    if (form.role === "external" && !form.projectIds.length) next.projectIds = "Assign an External/Client to at least one Project.";
    setErrors(next); return Object.keys(next).length === 0;
  }
  async function confirm() {
    setBusy(true); setErrors({});
    try {
      const response = await authenticatedFetch("/api/v1/memberships", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json() as { id?: number; data?: { id?: number }; error?: string | { message?: string; fields?: Record<string, string> } };
      if (!response.ok) {
        const objectError = typeof payload.error === "object" ? payload.error : null;
        setErrors({ ...objectError?.fields, form: objectError?.message || String(payload.error || "The invitation could not be created.") });
        setReview(false); return;
      }
      setCreatedId(Number(payload.data?.id ?? payload.id)); setReview(false);
    } catch { setErrors({ form: "The invitation could not be created. Check the connection and try again." }); setReview(false); }
    finally { setBusy(false); }
  }
  if (createdId) return <div className="mx-auto max-w-3xl pb-10"><section role="status" className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm"><div className="text-3xl text-emerald-700">✓</div><h1 className="mt-3 text-2xl font-bold">Invitation created</h1><p className="mt-2 text-sm text-slate-600">The pending membership, Project assignments, and optional linked Resource were saved atomically. A single-use 72-hour invitation was queued.</p><div className="mt-6 flex justify-center gap-2"><Link href={`/users/${createdId}`} className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white">View User</Link><Link href="/users" className="rounded-lg border px-4 py-3 text-sm font-bold">Return to Users</Link></div></section></div>;

  return <div className="mx-auto max-w-4xl space-y-6 pb-10">
    <nav className="text-sm text-slate-500"><Link href="/users">Users</Link><span className="px-2">/</span>Invite User</nav>
    <h1 className="text-3xl font-bold">Invite User</h1>
    {errors.form && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{errors.form}</div>}
    <form onSubmit={event => { event.preventDefault(); if (validate()) setReview(true); }} className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <section className="grid gap-4 p-5 sm:grid-cols-2"><Field id="invite-first-name" label="First Name" value={form.firstName} error={errors.firstName} onChange={value => set("firstName", value)} /><Field id="invite-last-name" label="Last Name" value={form.lastName} error={errors.lastName} onChange={value => set("lastName", value)} /><div className="sm:col-span-2"><Field id="invite-email" label="Login Email" value={form.email} error={errors.email} onChange={value => set("email", value)} type="email" /><p className="mt-1 text-xs text-slate-500">Email is globally unique. An existing identity must verify with its current password when accepting a second-company invitation.</p></div></section>
      <section className="space-y-4 border-t p-5"><div><label htmlFor="invite-role" className="text-sm font-bold">Role</label><select id="invite-role" value={form.role} onChange={event => set("role", event.target.value as CompanyRoleUi)} className="mt-2 min-h-11 w-full rounded-lg border px-3"><option value="employee">Employee (Internal)</option><option value="external">External/Client</option>{canInviteElevated && <><option value="admin">Admin</option><option value="owner">Owner</option></>}</select></div><label className="flex gap-3 rounded-lg border p-4"><input type="checkbox" checked={form.addAsResource} onChange={event => set("addAsResource", event.target.checked)} /><span><strong>Also add as a Resource</strong><span className="block text-xs text-slate-500">Creates one linked Employee-category Resource. Its lifecycle remains separate from login access.</span></span></label></section>
      <section className="space-y-3 border-t p-5"><h2 className="font-bold">Project assignments</h2><p className="text-xs text-slate-500">{form.role === "external" ? "These are the only Projects this External/Client may discover or open." : "Employees still see every company schedule; assignment controls team, Common-link, and notification eligibility."}</p><div className="grid gap-2 sm:grid-cols-2">{projects.map(project => <label key={project.id} className="flex gap-3 rounded-lg border p-3"><input type="checkbox" checked={form.projectIds.includes(project.id)} onChange={() => set("projectIds", form.projectIds.includes(project.id) ? form.projectIds.filter(id => id !== project.id) : [...form.projectIds, project.id])} /><span><strong className="block text-sm">{project.name}</strong><span className="text-xs text-slate-500">{project.projectType}</span></span></label>)}</div>{errors.projectIds && <p role="alert" className="text-sm font-semibold text-red-700">{errors.projectIds}</p>}</section>
      <div className="flex justify-end gap-2 border-t bg-slate-50 p-5"><Link href="/users" aria-label={dirty ? "Cancel and discard invitation" : "Cancel"} className="rounded-lg border px-4 py-3 text-sm font-bold">Cancel</Link><button type="submit" className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white">Review invitation</button></div>
    </form>
    {review && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role="dialog" aria-modal="true" aria-label="Confirm User invitation" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-xl font-bold">Confirm User invitation</h2><dl className="mt-4 divide-y rounded-lg border text-sm"><Review label="User" value={`${form.firstName.trim()} ${form.lastName.trim()}`} /><Review label="Login Email" value={form.email.trim()} /><Review label="Role" value={companyRoleLabel(form.role)} /><Review label="Project assignments" value={selected.map(project => project.name).join(", ") || "None"} /><Review label="Linked Resource" value={form.addAsResource ? "Create and link" : "Do not create"} /></dl><p className="mt-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-950">Confirming creates the membership and queues one 72-hour single-use invitation. No permanent password is collected.</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setReview(false)} className="rounded-lg border px-4 py-3 text-sm font-bold">Back to edit</button><button type="button" disabled={busy} onClick={confirm} className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white">{busy ? "Creating…" : "Create and send invitation"}</button></div></div></div>}
  </div>;
}

function Field({ id, label, value, error, onChange, type = "text" }: { id: string; label: string; value: string; error?: string; onChange: (value: string) => void; type?: string }) { return <div><label htmlFor={id} className="text-sm font-bold">{label}</label><input id={id} type={type} value={value} onChange={event => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border px-3" />{error && <p role="alert" className="mt-1 text-sm font-semibold text-red-700">{error}</p>}</div>; }
function Review({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>; }
