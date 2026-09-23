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
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<FilterRole>("all");
  const [status, setStatus] = useState<FilterStatus>("all");
  const [target, setTarget] = useState<CompanyUserUi | null>(null);
  const [action, setAction] = useState<"deactivate" | "restore" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(() => users.filter(user => {
    const matchesQuery = !normalized || `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(normalized);
    return matchesQuery && (role === "all" || user.role === role) && (status === "all" || user.status === status);
  }), [normalized, role, status, users]);
  const visible = pageItems(filtered, page);
  useEffect(() => { setPage(1); }, [normalized, role, status]);

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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Users</h1><p className="mt-2 text-sm text-slate-600">Manage the company directory, fixed Roles, invitations, linked Resources, and Project assignments.</p></div><Link href="/users/new" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">Invite User</Link></div>
    <section aria-label="Live access notice" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"><p className="font-semibold">Live company access</p><p>Role, lifecycle, and Project-assignment changes are saved immediately and revoke stale sessions. Historical work remains intact.</p></section>
    {message && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-950">{message}</div>}
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_210px_210px]"><div><label htmlFor="user-search" className="sr-only">Search Users</label><input id="user-search" aria-label="Search Users" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or email" className="min-h-11 w-full rounded-lg border border-slate-300 px-3" /></div><select aria-label="Filter Users by Role" value={role} onChange={event => setRole(event.target.value as FilterRole)} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="all">All Roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="employee">Employee (Internal)</option><option value="external">External/Client</option></select><select aria-label="Filter Users by Status" value={status} onChange={event => setStatus(event.target.value as FilterStatus)} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="all">All statuses</option><option value="active">Active</option><option value="pending">Invitation pending</option><option value="deactivated">Deactivated</option></select></div>
      {!visible.length ? <div className="p-12 text-center"><h2 className="font-bold">No matching Users</h2><p className="mt-2 text-sm text-slate-500">Try another filter or clear the search.</p><button type="button" onClick={() => { setQuery(""); setRole("all"); setStatus("all"); }} className="mt-4 rounded-lg border px-4 py-2 text-sm font-bold">Clear filters</button></div> : <div className="grid gap-3 p-4 md:grid-cols-2">{visible.map(user => <article key={user.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-slate-950">{userDisplayName(user)}{user.isCurrent && <span className="ml-2 text-xs text-blue-700">You</span>}</h2><p className="mt-1 break-all text-sm text-slate-500">{user.email}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${user.status === "active" ? "bg-emerald-100 text-emerald-800" : user.status === "pending" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{userStatusLabel(user.status)}</span></div><dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-slate-500">Role</dt><dd className="font-semibold">{companyRoleLabel(user.role)}</dd></div><div><dt className="text-slate-500">Last active</dt><dd className="font-semibold">{userLastActiveLabel(user)}</dd></div><div><dt className="text-slate-500">Projects</dt><dd className="font-semibold">{user.projects.filter(project => project.assigned).length}</dd></div><div><dt className="text-slate-500">Linked Resource</dt><dd className="font-semibold">{user.linkedResource?.name || "None"}</dd></div></dl><div className="mt-4 flex flex-wrap justify-end gap-2"><Link href={`/users/${user.id}`} className="inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-bold text-blue-700">View</Link>{user.permissions.canDeactivate && <button type="button" aria-label={`Deactivate ${userDisplayName(user)}`} onClick={() => { setTarget(user); setAction("deactivate"); }} className="min-h-10 rounded-lg border border-amber-300 px-3 text-sm font-bold text-amber-800">Deactivate</button>}{user.permissions.canRestore && <button type="button" aria-label={`Restore ${userDisplayName(user)}`} onClick={() => { setTarget(user); setAction("restore"); }} className="min-h-10 rounded-lg border border-emerald-300 px-3 text-sm font-bold text-emerald-800">Restore</button>}</div></article>)}</div>}
      <PaginationControls page={page} totalItems={filtered.length} onPageChange={setPage} label="Users" />
    </section>
    {target && action && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role="alertdialog" aria-modal="true" aria-label={action === "deactivate" ? "Deactivate User?" : "Restore User?"} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-xl font-bold">{action === "deactivate" ? "Deactivate User?" : "Restore User?"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{action === "deactivate" ? "Access ends immediately and active sessions are revoked. Historical Project assignments remain visible and linked Resource records remain separate." : "Access is restored using the existing Role and Project assignments."}</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => { setTarget(null); setAction(null); }} className="min-h-11 rounded-lg border px-4 font-bold">Cancel</button><button type="button" disabled={busy} onClick={confirmLifecycle} className="min-h-11 rounded-lg bg-blue-700 px-4 font-bold text-white">{busy ? "Saving…" : action === "deactivate" ? "Deactivate User" : "Restore User"}</button></div></div></div>}
  </div>;
}
