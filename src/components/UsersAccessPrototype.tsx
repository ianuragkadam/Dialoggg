"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  COMPANY_USERS_UI,
  companyRoleLabel,
  type CompanyRoleUi,
  type CompanyUserUi,
  type UserStatusUi,
  userStatusLabel,
} from "@/lib/users-access-ui";

type RoleFilter = "all" | CompanyRoleUi;
type StatusFilter = "all" | UserStatusUi;

const statusClass: Record<UserStatusUi, string> = {
  active: "bg-emerald-100 text-emerald-800",
  invited: "bg-blue-100 text-blue-800",
  deactivated: "bg-slate-200 text-slate-700",
};

export default function UsersAccessPrototype() {
  const [users, setUsers] = useState(COMPANY_USERS_UI);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [statusTarget, setStatusTarget] = useState<CompanyUserUi | null>(null);
  const [toast, setToast] = useState("");
  const triggerRef = useRef<HTMLElement | null>(null);

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return users.filter(user => {
      const matchesQuery = `${user.firstName} ${user.lastName} ${user.email}`.toLocaleLowerCase().includes(normalized);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [query, roleFilter, statusFilter, users]);

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

  function closeStatusDialog() {
    setStatusTarget(null);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function openStatusDialog(user: CompanyUserUi, event: React.MouseEvent<HTMLButtonElement>) {
    triggerRef.current = event.currentTarget;
    setStatusTarget(user);
  }

  function confirmStatusChange() {
    if (!statusTarget) return;
    const nextStatus: UserStatusUi = statusTarget.status === "deactivated" ? "active" : "deactivated";
    setUsers(current => current.map(user => user.id === statusTarget.id ? { ...user, status: nextStatus } : user));
    setToast(`${statusTarget.firstName} ${statusTarget.lastName} was ${nextStatus === "active" ? "restored" : "deactivated"} in this UI preview.`);
    closeStatusDialog();
  }

  const activeCount = users.filter(user => user.status === "active").length;
  const pendingCount = users.filter(user => user.status === "invited").length;
  const clientCount = users.filter(user => user.role === "external" && user.status !== "deactivated").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">Company settings <span aria-hidden="true" className="px-2">/</span> <span className="font-medium text-slate-800">Users</span></nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Users</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Invite people, apply one fixed company Role, and manage Project access without creating passwords for them.</p>
        </div>
        <Link href="/users/new" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
          <span aria-hidden="true" className="mr-2 text-lg">+</span>Invite User
        </Link>
      </div>

      <section aria-label="Prototype notice" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        <p className="font-semibold">UI preview · Admin permissions</p>
        <p>This screen demonstrates an Admin managing Employees and External/Clients. Owner-only promotion and Owner/Admin deactivation stay visibly locked. Changes reset on refresh and no invitation or access change is sent.</p>
      </section>

      <section aria-label="User summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Company Users" value={users.length} />
        <Summary label="Active" value={activeCount} tone="emerald" />
        <Summary label="Invitations pending" value={pendingCount} tone="blue" />
        <Summary label="External/Clients" value={clientCount} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="user-directory-title">
        <div className="space-y-4 border-b border-slate-200 p-4">
          <div>
            <h2 id="user-directory-title" className="font-bold text-slate-950">Company User directory</h2>
            <p className="mt-1 text-sm text-slate-500">Role labels and status names use the approved Dialoggg product language.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_190px_190px]">
            <div><label htmlFor="user-search" className="sr-only">Search Users</label><input id="user-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or email" className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200" /></div>
            <div><label htmlFor="role-filter" className="sr-only">Filter Users by Role</label><select id="role-filter" value={roleFilter} onChange={event => setRoleFilter(event.target.value as RoleFilter)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"><option value="all">All Roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="employee">Employee (Internal)</option><option value="external">External/Client</option></select></div>
            <div><label htmlFor="user-status-filter" className="sr-only">Filter Users by status</label><select id="user-status-filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"><option value="all">All statuses</option><option value="active">Active</option><option value="invited">Invitation pending</option><option value="deactivated">Deactivated</option></select></div>
          </div>
        </div>

        {visibleUsers.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">🧑‍💼</div>
            <h3 className="mt-4 font-bold text-slate-950">No matching Users</h3>
            <p className="mt-1 text-sm text-slate-500">Change the search, Role, or status filters to see more people.</p>
            <button type="button" onClick={() => { setQuery(""); setRoleFilter("all"); setStatusFilter("all"); }} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Clear filters</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {visibleUsers.map(user => {
              const protectedRole = user.role === "owner" || user.role === "admin";
              return (
                <article key={user.id} className="grid gap-4 p-5 hover:bg-slate-50 lg:grid-cols-[minmax(240px,1.3fr)_190px_190px_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{user.firstName} {user.lastName}</h3>{user.isCurrent && <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-800">You</span>}</div>
                    <p className="truncate text-sm text-slate-500">{user.email}</p>
                  </div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Role</p><p className="mt-1 text-sm font-semibold text-slate-800">{companyRoleLabel(user.role)}</p></div>
                  <div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClass[user.status]}`}>{userStatusLabel(user.status)}</span><p className="mt-1 text-xs text-slate-500">{user.invitationLabel || user.lastActiveLabel}</p></div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Link href={`/users/${user.id}`} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600">View</Link>
                    {!user.isCurrent && user.status !== "invited" && <button type="button" onClick={event => openStatusDialog(user, event)} disabled={protectedRole} title={protectedRole ? "Only an Owner can change another Owner or Admin." : undefined} aria-label={`${user.status === "deactivated" ? "Restore" : "Deactivate"} ${user.firstName} ${user.lastName}`} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">{protectedRole ? "Owner required" : user.status === "deactivated" ? "Restore" : "Deactivate"}</button>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="role-boundaries-title">
        <h2 id="role-boundaries-title" className="font-bold text-slate-950">Fixed Role boundaries</h2>
        <div className="mt-4 grid gap-3 text-sm leading-6 md:grid-cols-2 lg:grid-cols-4">
          <RoleCard title="Owner" text="All Admin permissions plus company settings, Owners/Admins, and Microsoft connection." />
          <RoleCard title="Admin" text="Manages Projects, Tasks, Events, Employees, External/Clients, Resources, Types, and Templates." />
          <RoleCard title="Employee (Internal)" text="Read-only across all company Projects and calendars; assignment controls team and Common-link behavior." />
          <RoleCard title="External/Client" text="Read-only and limited to explicitly assigned Projects; no company-wide calendar or Private link." />
        </div>
      </section>

      {toast && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[70] max-w-md rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl"><span aria-hidden="true" className="mr-2 text-emerald-400">✓</span>{toast}</div>}

      {statusTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={event => { if (event.target === event.currentTarget) closeStatusDialog(); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="user-status-title" aria-describedby="user-status-description" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl">!</div>
            <h2 id="user-status-title" className="mt-4 text-xl font-bold text-slate-950">{statusTarget.status === "deactivated" ? "Restore User?" : "Deactivate User?"}</h2>
            {statusTarget.status === "deactivated" ? (
              <p id="user-status-description" className="mt-2 text-sm leading-6 text-slate-600"><strong className="text-slate-900">{statusTarget.firstName} {statusTarget.lastName}</strong> can sign in again and can be selected for new Project assignments. Historical records remain unchanged.</p>
            ) : (
              <div id="user-status-description" className="mt-2 space-y-3 text-sm leading-6 text-slate-600"><p><strong className="text-slate-900">{statusTarget.firstName} {statusTarget.lastName}</strong> will lose access immediately.</p><ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950"><li>• Existing sessions are revoked.</li><li>• Historical Project assignments remain visible.</li><li>• The User cannot receive new assignments.</li><li>• Linked Resource records remain separate and are not deactivated automatically.</li></ul></div>
            )}
            <p className="mt-3 text-xs text-blue-800">UI preview only. No account or session is changed.</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={closeStatusDialog} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Cancel</button><button type="button" onClick={confirmStatusChange} className="min-h-11 rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-600">{statusTarget.status === "deactivated" ? "Restore User" : "Deactivate User"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "emerald" | "blue" }) {
  const classes = tone === "emerald" ? "border-emerald-200 bg-emerald-50" : tone === "blue" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white";
  return <div className={`rounded-xl border p-4 shadow-sm ${classes}`}><p className="text-sm text-slate-600">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>;
}

function RoleCard({ title, text }: { title: string; text: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-900">{title}</strong><span className="text-slate-600">{text}</span></div>;
}
