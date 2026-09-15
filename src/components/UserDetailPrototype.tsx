"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { companyRoleLabel, type CompanyRoleUi, type CompanyUserUi, userStatusLabel } from "@/lib/users-access-ui";

type DialogKind = "edit" | "role" | "deactivate" | "restore" | "resend" | "cancel-invite" | null;

export default function UserDetailPrototype({ sourceUser }: { sourceUser: CompanyUserUi }) {
  const [user, setUser] = useState(sourceUser);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [toast, setToast] = useState("");
  const [profile, setProfile] = useState({ firstName: user.firstName, lastName: user.lastName, email: user.email });
  const [profileError, setProfileError] = useState("");
  const [nextRole, setNextRole] = useState<"employee" | "external">(user.role === "external" ? "external" : "employee");
  const protectedRole = user.role === "owner" || user.role === "admin";
  const canManage = !protectedRole && !user.isCurrent;

  useEffect(() => {
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setDialog(null); } };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [dialog]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function saveProfile() {
    if (!profile.firstName.trim() || !profile.lastName.trim() || !/^\S+@\S+\.\S+$/.test(profile.email.trim())) {
      setProfileError("Enter a first name, last name, and valid login email.");
      return;
    }
    setUser(current => ({ ...current, firstName: profile.firstName.trim(), lastName: profile.lastName.trim(), email: profile.email.trim() }));
    setProfileError("");
    setDialog(null);
    setToast("User details were updated in this UI preview.");
  }

  function confirmRole() {
    setUser(current => ({ ...current, role: nextRole }));
    setDialog(null);
    setToast(`Role changed to ${companyRoleLabel(nextRole)} in this UI preview.`);
  }

  function confirmLifecycle() {
    if (dialog === "deactivate") setUser(current => ({ ...current, status: "deactivated" }));
    if (dialog === "restore") setUser(current => ({ ...current, status: "active" }));
    if (dialog === "cancel-invite") setUser(current => ({ ...current, status: "deactivated" }));
    const message = dialog === "deactivate" ? "User deactivated" : dialog === "restore" ? "User restored" : "Invitation cancelled";
    setDialog(null);
    setToast(`${message} in this UI preview.`);
  }

  const assignedProjects = user.projects.filter(project => project.assigned);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500"><Link href="/users" className="hover:text-blue-700">Users</Link><span aria-hidden="true" className="px-2">/</span><span className="font-medium text-slate-800">{user.firstName} {user.lastName}</span></nav>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-bold tracking-tight text-slate-950">{user.firstName} {user.lastName}</h1>{user.isCurrent && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800">You</span>}</div><p className="mt-2 text-sm text-slate-600">{companyRoleLabel(user.role)} · {userStatusLabel(user.status)}</p></div>{protectedRole ? <button type="button" disabled title="Only an Owner can change Project access for an Owner or Admin." className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-400">Owner required</button> : <Link href={`/users/${user.id}/projects`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-bold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600">Manage Project access</Link>}</div>

      <section aria-label="Prototype notice" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><p className="font-semibold">UI preview · Admin permissions</p><p>Profile, Role, invitation, lifecycle, and Project access changes on this screen are not saved and do not affect production access.</p></section>

      {protectedRole && <section role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Owner approval required.</strong> An Admin can view this membership but cannot change or deactivate an Owner/Admin. Only an Owner can promote to Admin or manage another Owner, and the final active Owner is always protected.</section>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="user-profile-title">
          <div className="flex items-center justify-between gap-3"><h2 id="user-profile-title" className="font-bold text-slate-950">User profile</h2><button type="button" onClick={() => setDialog("edit")} disabled={!canManage} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">{canManage ? "Edit details" : "Owner required"}</button></div>
          <dl className="mt-4 divide-y divide-slate-200 text-sm"><Row label="First Name" value={user.firstName} /><Row label="Last Name" value={user.lastName} /><Row label="Login Email" value={user.email} /><Row label="Last active" value={user.lastActiveLabel || "Has not signed in"} /></dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="membership-detail-title">
          <h2 id="membership-detail-title" className="font-bold text-slate-950">Company membership</h2>
          <dl className="mt-4 divide-y divide-slate-200 text-sm"><Row label="Role" value={companyRoleLabel(user.role)} /><Row label="Status" value={userStatusLabel(user.status)} /><Row label="Linked Resource" value={user.linkedResource || "Not linked"} /><Row label="Assigned Projects" value={String(assignedProjects.length)} /></dl>
          {canManage && user.status !== "invited" && <div className="mt-4"><label htmlFor="detail-role" className="text-sm font-bold text-slate-800">Change Role</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><select id="detail-role" value={nextRole} onChange={event => setNextRole(event.target.value as "employee" | "external")} className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"><option value="employee">Employee (Internal)</option><option value="external">External/Client</option></select><button type="button" onClick={() => setDialog("role")} disabled={nextRole === user.role} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50">Review Role change</button></div><p className="mt-2 text-xs leading-5 text-slate-500">Admin and Owner choices are intentionally absent because only an Owner can promote another member.</p></div>}
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="assigned-projects-title"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 id="assigned-projects-title" className="font-bold text-slate-950">Project assignments</h2><p className="mt-1 text-sm text-slate-500">{user.role === "external" ? "These are the only Projects this External/Client may see." : "Employees see all schedules; these assignments control team, Common-link, and notification behavior."}</p></div>{protectedRole ? <span className="text-sm font-bold text-slate-400">Owner required</span> : <Link href={`/users/${user.id}/projects`} className="text-sm font-bold text-blue-700 hover:underline">Edit assignments</Link>}</div>{assignedProjects.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{assignedProjects.map(project => <div key={project.id} className="rounded-lg border border-slate-200 p-3"><strong className="text-sm text-slate-900">{project.name}</strong><p className="text-xs text-slate-500">{project.projectType}</p></div>)}</div> : <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No Project assignments.</p>}</section>

      {canManage && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="account-actions-title"><h2 id="account-actions-title" className="font-bold text-slate-950">Account actions</h2>{user.status === "invited" ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setDialog("resend")} className="min-h-11 rounded-lg border border-blue-300 px-4 py-2 text-sm font-bold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600">Resend 72-hour invitation</button><button type="button" onClick={() => setDialog("cancel-invite")} className="min-h-11 rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700 focus:outline-none focus:ring-2 focus:ring-red-600">Cancel invitation</button></div> : <button type="button" onClick={() => setDialog(user.status === "active" ? "deactivate" : "restore")} className="mt-3 min-h-11 rounded-lg border border-amber-300 px-4 py-2 text-sm font-bold text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-600">{user.status === "active" ? "Deactivate User" : "Restore User"}</button>}</section>}

      {toast && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[70] max-w-md rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl"><span aria-hidden="true" className="mr-2 text-emerald-400">✓</span>{toast}</div>}

      {dialog === "edit" && <Modal title="Edit User details" description="Change the membership profile. A production email change would require identity verification." onClose={() => setDialog(null)}><div className="space-y-3"><Field id="edit-first-name" label="First Name" value={profile.firstName} onChange={value => setProfile(current => ({ ...current, firstName: value }))} /><Field id="edit-last-name" label="Last Name" value={profile.lastName} onChange={value => setProfile(current => ({ ...current, lastName: value }))} /><Field id="edit-email" label="Login Email" value={profile.email} onChange={value => setProfile(current => ({ ...current, email: value }))} type="email" />{profileError && <p role="alert" className="text-sm font-semibold text-red-700">{profileError}</p>}</div><Actions cancelLabel="Cancel" confirmLabel="Save UI preview" onCancel={() => setDialog(null)} onConfirm={saveProfile} /></Modal>}

      {dialog === "role" && <Modal title="Change company Role?" description={`${user.firstName} ${user.lastName} will change from ${companyRoleLabel(user.role)} to ${companyRoleLabel(nextRole)}.`} onClose={() => setDialog(null)}><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">{nextRole === "external" ? "External/Client access becomes limited to assigned Projects immediately. At least one Project must remain assigned." : "Employee (Internal) becomes read-only across every company Project and all three company calendars."}</div><p className="mt-3 text-xs text-blue-800">UI preview only. No permissions or sessions change.</p><Actions cancelLabel="Cancel" confirmLabel="Change Role" onCancel={() => setDialog(null)} onConfirm={confirmRole} /></Modal>}

      {(dialog === "deactivate" || dialog === "restore" || dialog === "cancel-invite") && <Modal title={dialog === "deactivate" ? "Deactivate User?" : dialog === "restore" ? "Restore User?" : "Cancel invitation?"} description={dialog === "deactivate" ? "The User will lose access and existing sessions will be revoked." : dialog === "restore" ? "The User can sign in and receive new assignments again." : "The unused invitation link will stop working."} onClose={() => setDialog(null)} alert><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">Historical Project, Task, Event, and Resource associations remain visible. Linked Resources are managed separately.</div><p className="mt-3 text-xs text-blue-800">UI preview only. No account, session, or invitation changes.</p><Actions cancelLabel="Cancel" confirmLabel={dialog === "deactivate" ? "Deactivate User" : dialog === "restore" ? "Restore User" : "Cancel invitation"} onCancel={() => setDialog(null)} onConfirm={confirmLifecycle} /></Modal>}

      {dialog === "resend" && <Modal title="Resend invitation?" description={`A new 72-hour single-use link will replace the previous invitation for ${user.email}.`} onClose={() => setDialog(null)}><p className="rounded-lg bg-blue-50 p-3 text-sm leading-6 text-blue-950">The old link will no longer work. This UI preview sends no email.</p><Actions cancelLabel="Cancel" confirmLabel="Resend UI preview" onCancel={() => setDialog(null)} onConfirm={() => { setDialog(null); setToast("Invitation resend preview completed. No email was sent."); }} /></Modal>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[130px_1fr] gap-4 py-3"><dt className="text-slate-500">{label}</dt><dd className="break-words font-semibold text-slate-900">{value}</dd></div>; }

function Field({ id, label, value, onChange, type = "text" }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string }) { return <div><label htmlFor={id} className="text-sm font-bold text-slate-800">{label}</label><input id={id} type={type} value={value} onChange={event => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" /></div>; }

function Modal({ title, description, onClose, children, alert = false }: { title: string; description: string; onClose: () => void; children: React.ReactNode; alert?: boolean }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-xl">🧑‍💼</div><h2 className="mt-4 text-xl font-bold text-slate-950">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p><div className="mt-4">{children}</div></div></div>; }

function Actions({ cancelLabel, confirmLabel, onCancel, onConfirm }: { cancelLabel: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) { return <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={onCancel} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">{cancelLabel}</button><button type="button" onClick={onConfirm} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">{confirmLabel}</button></div>; }
