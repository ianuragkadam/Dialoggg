"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { companyRoleLabel, type CompanyUserUi } from "@/lib/users-access-ui";

export default function UserProjectAccessPrototype({ sourceUser }: { sourceUser: CompanyUserUi }) {
  const protectedRole = sourceUser.role === "owner" || sourceUser.role === "admin";
  const originalIds = useMemo(() => sourceUser.projects.filter(project => project.assigned).map(project => project.id), [sourceUser.projects]);
  const [selectedIds, setSelectedIds] = useState(originalIds);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const dirty = selectedIds.slice().sort().join("|") !== originalIds.slice().sort().join("|");
  const added = sourceUser.projects.filter(project => selectedIds.includes(project.id) && !originalIds.includes(project.id));
  const removed = sourceUser.projects.filter(project => !selectedIds.includes(project.id) && originalIds.includes(project.id));

  useEffect(() => {
    if (!reviewOpen && !discardOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (discardOpen) setDiscardOpen(false);
      else setReviewOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [discardOpen, reviewOpen]);

  function toggle(id: string) {
    if (protectedRole) return;
    setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    setError("");
  }

  function review() {
    if (protectedRole) return;
    if (sourceUser.role === "external" && selectedIds.length === 0) {
      setError("An External/Client must remain assigned to at least one Project.");
      return;
    }
    setReviewOpen(true);
  }

  if (completed) return <div className="mx-auto max-w-3xl pb-10"><section role="status" className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm"><div aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800">✓</div><h1 className="mt-4 text-2xl font-bold text-slate-950">Project access preview complete</h1><p className="mt-2 text-sm leading-6 text-slate-600">The assignment changes for <strong>{sourceUser.firstName} {sourceUser.lastName}</strong> are ready for implementation review.</p><div className="mx-auto mt-5 max-w-xl rounded-lg border border-blue-200 bg-blue-50 p-4 text-left text-sm leading-6 text-blue-950"><strong>UI preview only:</strong> no Project access, Common-folder eligibility, notification, calendar, or session state changed.</div><div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Link href={`/users/${sourceUser.id}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">Return to User</Link><button type="button" onClick={() => setCompleted(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Review assignments</button></div></section></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500"><Link href="/users" className="hover:text-blue-700">Users</Link><span aria-hidden="true" className="px-2">/</span><Link href={`/users/${sourceUser.id}`} className="hover:text-blue-700">{sourceUser.firstName} {sourceUser.lastName}</Link><span aria-hidden="true" className="px-2">/</span><span className="font-medium text-slate-800">Project access</span></nav>
      <div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Project access</h1><p className="mt-2 text-sm leading-6 text-slate-600">Choose how <strong>{sourceUser.firstName} {sourceUser.lastName}</strong> participates in company Projects as {companyRoleLabel(sourceUser.role)}.</p></div>
      <section aria-label="Prototype notice" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><p className="font-semibold">UI preview</p><p>Assignment changes reset on refresh and do not change production access, notifications, calendars, or Microsoft links.</p></section>
      {protectedRole && <section role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Owner approval required.</strong> An Admin may review these assignments but cannot change Project access for an Owner or Admin.</section>}
      <section className={`rounded-xl border p-4 text-sm leading-6 ${sourceUser.role === "external" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}><strong>{protectedRole ? "Owner/Admin assignment context" : sourceUser.role === "external" ? "External/Client boundary" : "Employee (Internal) behavior"}</strong><p>{protectedRole ? "These Project assignments are shown for context only. An Owner must make any change to another Owner or Admin membership." : sourceUser.role === "external" ? "This User sees only selected Projects, their simple client view, Project Calendar, permitted Common link, and any per-Project simple Gantt enabled by an Owner/Admin. Unassigned Projects and company-wide calendars remain hidden." : "This User remains read-only across all company Projects and all three calendars. Assignment controls team membership, Common-folder eligibility, and relevant Project notifications—not schedule visibility."}</p></section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="available-projects-title"><div><h2 id="available-projects-title" className="font-bold text-slate-950">Company Projects</h2><p className="mt-1 text-sm text-slate-500">{selectedIds.length} of {sourceUser.projects.length} selected</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{sourceUser.projects.map(project => <label key={project.id} className={`flex items-start gap-3 rounded-lg border p-4 ${protectedRole ? "cursor-not-allowed bg-slate-50" : "cursor-pointer"} ${selectedIds.includes(project.id) ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}><input type="checkbox" checked={selectedIds.includes(project.id)} onChange={() => toggle(project.id)} disabled={protectedRole} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:cursor-not-allowed" /><span><strong className="block text-sm text-slate-900">{project.name}</strong><span className="text-xs text-slate-500">{project.projectType}</span></span></label>)}</div>{error && <p role="alert" className="mt-4 text-sm font-semibold text-red-700">{error}</p>}</section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm" aria-labelledby="assignment-impact-title"><h2 id="assignment-impact-title" className="font-bold text-slate-950">Assignment impact</h2><ul className="mt-2 space-y-1"><li>• Access and link visibility update immediately after a connected save.</li><li>• Historical activity and Task/Event records are never deleted.</li><li>• Resource scheduling remains controlled by Resource assignments, not this Project membership.</li><li>• The final API must recheck company scope and Role on every request.</li></ul></section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => dirty ? setDiscardOpen(true) : window.location.assign(`/users/${sourceUser.id}`)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">{protectedRole ? "Return to User" : "Cancel"}</button><button type="button" onClick={review} disabled={protectedRole || !dirty} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50">{protectedRole ? "Owner required" : "Review access changes"}</button></div>

      {reviewOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setReviewOpen(false); }}><div role="dialog" aria-modal="true" aria-labelledby="access-review-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-xl">📁</div><h2 id="access-review-title" className="mt-4 text-xl font-bold text-slate-950">Confirm Project access changes</h2><p className="mt-2 text-sm leading-6 text-slate-600">Review the exact additions and removals for {sourceUser.firstName} {sourceUser.lastName}.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><ChangeList title="Add access" names={added.map(project => project.name)} /><ChangeList title="Remove access" names={removed.map(project => project.name)} /></div><div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-950">UI preview only. A connected save must update authorization, Common-link eligibility, and notifications atomically and record an audit event.</div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setReviewOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Back to edit</button><button type="button" onClick={() => { setReviewOpen(false); setCompleted(true); }} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">Confirm UI preview</button></div></div></div>}

      {discardOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="discard-access-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl">!</div><h2 id="discard-access-title" className="mt-4 text-xl font-bold text-slate-950">Leave Project access?</h2><p className="mt-2 text-sm leading-6 text-slate-600">Your unsaved Project assignment changes will be discarded. Production access has not changed.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setDiscardOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Keep editing</button><Link href={`/users/${sourceUser.id}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-600">Discard and leave</Link></div></div></div>}
    </div>
  );
}

function ChangeList({ title, names }: { title: string; names: string[] }) { return <div className="rounded-lg border border-slate-200 p-3"><h3 className="text-sm font-bold text-slate-900">{title}</h3>{names.length ? <ul className="mt-2 space-y-1 text-xs text-slate-600">{names.map(name => <li key={name}>• {name}</li>)}</ul> : <p className="mt-2 text-xs text-slate-500">No changes</p>}</div>; }
