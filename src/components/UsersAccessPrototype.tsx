"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { authenticatedFetch } from "@/lib/client-fetch";
import { companyRoleLabel, userDisplayName, userLastActiveLabel, userStatusLabel, type CompanyRoleUi, type CompanyUserUi, type UserStatusUi } from "@/lib/users-access-ui";
import PaginationControls, { pageItems } from "@/components/PaginationControls";

type FilterRole = "all" | CompanyRoleUi;
type FilterStatus = "all" | UserStatusUi;

export default function UsersAccessPrototype({ initialUsers }: { initialUsers: CompanyUserUi[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [target, setTarget] = useState<CompanyUserUi | null>(null);
  const [action, setAction] = useState<"deactivate" | "restore" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function confirmLifecycle() {
    if (!target || !action) return;
    setBusy(true); setMessage("");
    try {
      const response = await authenticatedFetch(`/api/v1/memberships/${target.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
      });
      const payload = await response.json() as { data?: { user?: CompanyUserUi }; error?: { message?: string } };
      if (!response.ok || !payload.data?.user) { setMessage(payload.error?.message || "The membership could not be updated."); return; }
      setUsers(current => current.map(user => user.id === target.id ? payload.data!.user! : user));
      setMessage(`${userDisplayName(target)} was ${action === "deactivate" ? "deactivated" : "restored"}.`);
      setTarget(null); setAction(null);
    } catch { setMessage("The membership could not be updated. Check the connection and try again."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-6xl space-y-6 pb-10">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><h1 className="text-3xl font-bold tracking-tight text-slate-950">Internal Users</h1><Link href="/users/new" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">Invite User</Link></div>
    {message && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-950">{message}</div>}
    <UserSection title="Internal Users" users={users.filter(user => user.role !== "external")} showRoleFilter onLifecycle={(user, nextAction) => { setTarget(user); setAction(nextAction); }} />
    <div className="space-y-3">
      <h2 className="text-2xl font-bold tracking-tight text-slate-950">External Users / Clients</h2>
      <UserSection title="External Users / Clients" users={users.filter(user => user.role === "external")} onLifecycle={(user, nextAction) => { setTarget(user); setAction(nextAction); }} />
    </div>
    {target && action && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role="alertdialog" aria-modal="true" aria-label={action === "deactivate" ? "Deactivate User?" : "Restore User?"} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-xl font-bold">{action === "deactivate" ? "Deactivate User?" : "Restore User?"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{action === "deactivate" ? "Access ends immediately and active sessions are revoked. Historical Project assignments remain visible and linked Resource records remain separate." : "Access is restored using the existing Role and Project assignments."}</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => { setTarget(null); setAction(null); }} className="min-h-11 rounded-lg border px-4 font-bold">Cancel</button><button type="button" disabled={busy} onClick={confirmLifecycle} className="min-h-11 rounded-lg bg-blue-700 px-4 font-bold text-white">{busy ? "Saving…" : action === "deactivate" ? "Deactivate User" : "Restore User"}</button></div></div></div>}
  </div>;
}

function UserSection({ title, users, showRoleFilter = false, onLifecycle }: {
  title: string;
  users: CompanyUserUi[];
  showRoleFilter?: boolean;
  onLifecycle: (user: CompanyUserUi, action: "deactivate" | "restore") => void;
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
    {!visible.length ? <div className="px-6 py-12 text-center"><h3 className="font-bold">No matching {title}</h3><p className="mt-2 text-sm text-slate-500">Try another filter or clear the search.</p><button type="button" onClick={() => { setQuery(""); setRole("all"); setStatus("all"); }} className="mt-4 rounded-lg border px-4 py-2 text-sm font-bold">Clear filters</button></div> : <div className="divide-y divide-slate-200 xl:grid xl:grid-cols-[minmax(190px,2fr)_minmax(100px,1fr)_minmax(130px,1fr)_75px_minmax(110px,1fr)_190px] xl:gap-x-4 xl:px-4">{visible.map(user => <article key={user.id} className="grid gap-4 p-4 sm:grid-cols-2 xl:col-span-6 xl:grid-cols-subgrid xl:items-center xl:px-0">
      <div className="min-w-0 sm:col-span-2 xl:col-span-1">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{userDisplayName(user)}{user.isCurrent && <span className="ml-2 text-xs text-blue-700">You</span>}</h3><span className={`rounded-full px-2 py-1 text-xs font-bold ${user.status === "active" ? "bg-emerald-100 text-emerald-800" : user.status === "pending" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{userStatusLabel(user.status)}</span></div>
        <p className="mt-1 break-all text-sm text-slate-500">{user.email}</p>
      </div>
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Role</p><p className="mt-1 break-words text-sm font-semibold">{companyRoleLabel(user.role)}</p></div>
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Last active</p><p className="mt-1 break-words text-sm font-semibold">{userLastActiveLabel(user)}</p></div>
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Projects</p><p className="mt-1 text-sm font-semibold">{user.projects.filter(project => project.assigned).length}</p></div>
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Linked Resource</p><p className="mt-1 break-words text-sm font-semibold">{user.linkedResource?.name || "None"}</p></div>
      <div className="flex min-w-0 flex-wrap gap-2 sm:col-span-2 xl:col-span-1 xl:justify-end"><Link href={`/users/${user.id}`} className="inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-bold text-blue-700">View</Link>{user.permissions.canDeactivate && <button type="button" aria-label={`Deactivate ${userDisplayName(user)}`} onClick={() => onLifecycle(user, "deactivate")} className="min-h-10 rounded-lg border border-amber-300 px-3 text-sm font-bold text-amber-800">Deactivate</button>}{user.permissions.canRestore && <button type="button" aria-label={`Restore ${userDisplayName(user)}`} onClick={() => onLifecycle(user, "restore")} className="min-h-10 rounded-lg border border-emerald-300 px-3 text-sm font-bold text-emerald-800">Restore</button>}</div>
    </article>)}</div>}
    <PaginationControls page={page} totalItems={filtered.length} onPageChange={setPage} label={title} />
  </section>;
}
