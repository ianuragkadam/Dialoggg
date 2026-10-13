"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { authenticatedFetch } from "@/lib/client-fetch";
import { companyRoleLabel, userDisplayName, userLastActiveLabel, userStatusLabel, type CompanyRoleUi, type CompanyUserUi, type UserStatusUi } from "@/lib/users-access-ui";
import PaginationControls, { pageItems } from "@/components/PaginationControls";
import HowItWorks from "@/components/HowItWorks";
import TimedNotice from "@/components/TimedNotice";
import type { DeletedCompanyUserDto } from "@/lib/user-management";

type FilterRole = "all" | CompanyRoleUi;
type FilterStatus = "all" | UserStatusUi;
const USERS_GUIDE = [
  "A user is someone who logs in to Dialoggg. Owners and Admins click Invite User to add one. They'll get an email to set up their login.",
  "There are four roles. Owner and Admin can create and edit projects and schedules. Employee can view everything but can't change anything. External/Client can view only the projects they've been given access to.",
  "Owners can invite any role, including more Owners. Admins can invite Admins, Employees, and clients, but not Owners.",
  "Your team is listed at the top of this page, and clients and other outside people are in External Users / Clients below it.",
  "Employees see every project and schedule. The projects you check under Project assignments are the ones that appear on that person's My Projects page, and they're the ones the person gets notifications for.",
  "A user isn't automatically a resource. Check Also add as a Resource when inviting someone you'll schedule on tasks, or link them later under Resources.",
  "Deactivate a user who should no longer log in. Their access ends immediately and they're signed out. Their past project assignments stay visible, and a linked resource isn't affected.",
];

export default function UsersAccessPrototype({ initialUsers, initialDeletedUsers }: { initialUsers: CompanyUserUi[]; initialDeletedUsers: DeletedCompanyUserDto[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [deletedUsers, setDeletedUsers] = useState(initialDeletedUsers);
  const [target, setTarget] = useState<CompanyUserUi | null>(null);
  const [action, setAction] = useState<"deactivate" | "restore" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  async function confirmLifecycle() {
    if (!target || !action) return;
    setBusy(true); setMessage(null);
    try {
      const deleting = action === "delete";
      const response = await authenticatedFetch(`/api/v1/memberships/${target.id}`, deleting ? {
        method: "DELETE",
      } : {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
      });
      const payload = await response.json() as { data?: { user?: CompanyUserUi; removed?: boolean; removedAt?: string }; error?: { message?: string } };
      if (!response.ok || (deleting ? !payload.data?.removed : !payload.data?.user)) {
        setMessage({ text: payload.error?.message || (deleting ? "The User could not be removed." : "The membership could not be updated."), tone: "error" });
        setTarget(null); setAction(null);
        return;
      }
      setUsers(current => deleting ? current.filter(user => user.id !== target.id) : current.map(user => user.id === target.id ? payload.data!.user! : user));
      if (deleting) {
        const removedAt = payload.data?.removedAt || new Date().toISOString();
        setDeletedUsers(current => [{ id: target.id, name: userDisplayName(target), email: target.email, removedAt }, ...current.filter(user => user.id !== target.id)]);
      }
      setMessage({ text: deleting ? `${userDisplayName(target)} was removed from this company.` : `${userDisplayName(target)} was ${action === "deactivate" ? "deactivated" : "restored"}.`, tone: "success" });
      setTarget(null); setAction(null);
    } catch { setMessage({ text: action === "delete" ? "The User could not be removed. Check the connection and try again." : "The membership could not be updated. Check the connection and try again.", tone: "error" }); setTarget(null); setAction(null); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-6xl space-y-6 pb-10">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><h1 className="text-3xl font-bold tracking-tight text-slate-950">Internal Users</h1><Link href="/users/new" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">Invite User</Link></div>
    <HowItWorks items={USERS_GUIDE} />
    {message && <TimedNotice message={message.text} tone={message.tone} onDismiss={() => setMessage(null)} />}
    <UserSection title="Internal Users" users={users.filter(user => user.role !== "external")} showRoleFilter onLifecycle={(user, nextAction) => { setTarget(user); setAction(nextAction); }} />
    <div className="space-y-3">
      <h2 className="text-2xl font-bold tracking-tight text-slate-950">External Users / Clients</h2>
      <UserSection title="External Users / Clients" users={users.filter(user => user.role === "external")} onLifecycle={(user, nextAction) => { setTarget(user); setAction(nextAction); }} />
    </div>
    <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-5 font-bold text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600">
        <span>Deleted Users <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{deletedUsers.length}</span></span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-none stroke-current transition-transform group-open:rotate-180" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div className="border-t border-slate-200 p-5">
        <p className="text-sm leading-6 text-slate-600">These Users were removed from this company. Their company access was removed; the deletion record and timestamp remain available here.</p>
        {deletedUsers.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No Users have been removed from this company.</p> : <ul className="mt-4 space-y-3">{deletedUsers.map(user => <li key={user.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900">{user.name} was removed from this company.</p><p className="break-all text-sm text-slate-500">{user.email}</p></div><p className="text-sm text-slate-600">Deleted {formatRemovedAt(user.removedAt)}</p></li>)}</ul>}
      </div>
    </details>
    {target && action && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role="alertdialog" aria-modal="true" aria-label={action === "deactivate" ? "Deactivate User?" : action === "restore" ? "Restore User?" : "Delete User?"} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-xl font-bold">{action === "deactivate" ? "Deactivate User?" : action === "restore" ? "Restore User?" : "Remove User from this Company?"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{action === "deactivate" ? "Access ends immediately. We revoke stale sessions, keep historical Project assignments visible, and leave linked Resource records separate." : action === "restore" ? "Access is restored using the existing Role and Project assignments." : "They will lose access immediately and be removed from this User list. Project assignments and pending invitations are removed; linked Resources and historical records are kept. You can invite them again later."}</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => { setTarget(null); setAction(null); }} className="min-h-11 rounded-lg border px-4 font-bold">Cancel</button><button type="button" disabled={busy} onClick={confirmLifecycle} className={`min-h-11 rounded-lg px-4 font-bold text-white ${action === "delete" ? "bg-red-700" : "bg-blue-700"}`}>{busy ? "Saving…" : action === "deactivate" ? "Deactivate User" : action === "restore" ? "Restore User" : "Delete User"}</button></div></div></div>}
  </div>;
}

function formatRemovedAt(value: string) {
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function UserSection({ title, users, showRoleFilter = false, onLifecycle }: {
  title: string;
  users: CompanyUserUi[];
  showRoleFilter?: boolean;
  onLifecycle: (user: CompanyUserUi, action: "deactivate" | "restore" | "delete") => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<FilterRole>("all");
  const [status, setStatus] = useState<FilterStatus>("all");
  const [page, setPage] = useState(1);
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(() => users.filter(user => {
    const matchesQuery = !normalized || `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(normalized);
    return matchesQuery && (!showRoleFilter || role === "all" || user.role === role) && (status === "all" || user.status === status);
  }), [normalized, role, showRoleFilter, status, users]);
  const visible = pageItems(filtered, page);
  useEffect(() => { setPage(1); }, [normalized, role, status]);

  return <section aria-label={title} className="rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className={`grid gap-3 border-b p-4 ${showRoleFilter ? "md:grid-cols-[minmax(0,1fr)_210px_210px]" : "md:grid-cols-[minmax(0,1fr)_210px]"}`}>
      <div><label htmlFor={`user-search-${showRoleFilter ? "internal" : "external"}`} className="sr-only">Search {title}</label><input id={`user-search-${showRoleFilter ? "internal" : "external"}`} aria-label={`Search ${title}`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or email" className="min-h-11 w-full rounded-lg border border-slate-300 px-3" /></div>
      {showRoleFilter && <select aria-label="Filter Internal Users by Role" value={role} onChange={event => setRole(event.target.value as FilterRole)} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="all">All Roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="employee">Employee (Internal)</option></select>}
      <select aria-label={`Filter ${title} by Status`} value={status} onChange={event => setStatus(event.target.value as FilterStatus)} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="all">All statuses</option><option value="active">Active</option><option value="pending">Invitation pending</option><option value="deactivated">Deactivated</option></select>
    </div>
    {!visible.length ? <div className="px-6 py-12 text-center"><h3 className="font-bold">No matching {title}</h3><p className="mt-2 text-sm text-slate-500">Try another filter or clear the search.</p><button type="button" onClick={() => { setQuery(""); setRole("all"); setStatus("all"); }} className="mt-4 rounded-lg border px-4 py-2 text-sm font-bold">Clear filters</button></div> : <div className="grid gap-3 p-4">{visible.map(user => <article key={user.id} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
      <div className="flex min-w-0 items-start justify-between gap-4 sm:col-span-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{userDisplayName(user)}{user.isCurrent && <span className="ml-2 text-xs text-blue-700">You</span>}</h3><span className={`rounded-full px-2 py-1 text-xs font-bold ${user.status === "active" ? "bg-emerald-100 text-emerald-800" : user.status === "pending" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{userStatusLabel(user.status)}</span></div>
        <p className="mt-1 break-all text-sm text-slate-500">{user.email}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2"><Link href={`/users/${user.id}`} className="inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-bold text-blue-700">View</Link>{user.permissions.canDeactivate && <button type="button" aria-label={`Deactivate ${userDisplayName(user)}`} onClick={() => onLifecycle(user, "deactivate")} className="min-h-10 rounded-lg border border-amber-300 px-3 text-sm font-bold text-amber-800">Deactivate</button>}{user.permissions.canRestore && <button type="button" aria-label={`Restore ${userDisplayName(user)}`} onClick={() => onLifecycle(user, "restore")} className="min-h-10 rounded-lg border border-emerald-300 px-3 text-sm font-bold text-emerald-800">Restore</button>}{user.permissions.canDelete && <button type="button" aria-label={`Delete ${userDisplayName(user)}`} onClick={() => onLifecycle(user, "delete")} className="min-h-10 rounded-lg border border-red-300 px-3 text-sm font-bold text-red-700">Delete</button>}</div>
      </div>
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Role</p><p className="mt-1 break-words text-sm font-semibold">{companyRoleLabel(user.role)}</p></div>
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Last active</p><p className="mt-1 break-words text-sm font-semibold">{userLastActiveLabel(user)}</p></div>
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Projects</p><p className="mt-1 text-sm font-semibold">{user.projects.filter(project => project.assigned).length}</p></div>
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Linked Resource</p><p className="mt-1 break-words text-sm font-semibold">{user.linkedResource?.name || "None"}</p></div>
    </article>)}</div>}
    <PaginationControls page={page} totalItems={filtered.length} onPageChange={setPage} label={title} />
  </section>;
}
