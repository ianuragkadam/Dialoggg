"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { authenticatedFetch } from "@/lib/client-fetch";
import { companyRoleLabel, userDisplayName, type CompanyUserUi } from "@/lib/users-access-ui";

export default function UserProjectAccessPrototype({ sourceUser }: { sourceUser: CompanyUserUi }) {
  const original = useMemo(() => sourceUser.projects.filter(project => project.assigned).map(project => project.id), [sourceUser.projects]);
  const [selected, setSelected] = useState(original);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = [...selected].sort().join(",") !== [...original].sort().join(",");
  const added = sourceUser.projects.filter(project => selected.includes(project.id) && !original.includes(project.id));
  const removed = sourceUser.projects.filter(project => !selected.includes(project.id) && original.includes(project.id));

  function openReview() { if (sourceUser.role === "external" && !selected.length) { setError("An External/Client must remain assigned to at least one Project."); return; } setReview(true); }
  async function save() {
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/v1/memberships/${sourceUser.id}/projects`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectIds: selected }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) { setError(payload.error?.message || "Project assignments could not be saved."); setReview(false); return; }
      setReview(false); setSaved(true);
    } catch { setError("Project assignments could not be saved. Check the connection and try again."); setReview(false); }
    finally { setBusy(false); }
  }
  if (saved) return <div className="mx-auto max-w-3xl pb-10"><section role="status" className="rounded-2xl border border-emerald-200 bg-white p-8 text-center"><h1 className="text-2xl font-bold">Project access saved</h1><p className="mt-2 text-sm text-slate-600">Authorization, team membership, Common-link eligibility, and session state now reflect the saved assignments.</p><Link href={`/users/${sourceUser.id}`} className="mt-6 inline-flex rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white">Return to User</Link></section></div>;

  return <div className="mx-auto max-w-5xl space-y-6 pb-10"><nav className="text-sm text-slate-500"><Link href="/users">Users</Link><span className="px-2">/</span><Link href={`/users/${sourceUser.id}`}>{userDisplayName(sourceUser)}</Link><span className="px-2">/</span>Project access</nav><div><h1 className="text-3xl font-bold">Project access</h1><p className="mt-2 text-sm text-slate-600">Manage {userDisplayName(sourceUser)} as {companyRoleLabel(sourceUser.role)}.</p></div>
    <section className={`rounded-xl border p-4 text-sm leading-6 ${sourceUser.role === "external" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}><strong>{sourceUser.role === "external" ? "External/Client isolation" : "Employee assignment semantics"}</strong><p>{sourceUser.role === "external" ? "Only selected Projects are discoverable through lists, direct routes, APIs, calendars, and feeds. At least one assignment is required." : "Employees retain read-only access to every company Project and all company calendars. Assignment controls team, Common-link, and notification eligibility."}</p></section>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div>}
    <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-bold">Company Projects</h2><p className="mt-1 text-sm text-slate-500">{selected.length} of {sourceUser.projects.length} selected</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{sourceUser.projects.map(project => <label key={project.id} className={`flex gap-3 rounded-lg border p-4 ${selected.includes(project.id) ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}><input type="checkbox" checked={selected.includes(project.id)} onChange={() => { setSelected(current => current.includes(project.id) ? current.filter(id => id !== project.id) : [...current, project.id]); setError(""); }} /><span><strong className="block text-sm">{project.name}</strong><span className="text-xs text-slate-500">{project.projectType}</span></span></label>)}</div></section>
    <div className="flex justify-end gap-2"><Link href={`/users/${sourceUser.id}`} className="rounded-lg border px-4 py-3 text-sm font-bold">Cancel</Link><button type="button" disabled={!dirty} onClick={openReview} className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Review access changes</button></div>
    {review && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role="dialog" aria-modal="true" aria-label="Confirm Project access changes" className="w-full max-w-lg rounded-2xl bg-white p-5"><h2 className="text-xl font-bold">Confirm Project access changes</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Change title="Add access" names={added.map(project => project.name)} /><Change title="Remove access" names={removed.map(project => project.name)} /></div><p className="mt-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-950">Saving updates authorization and legacy compatibility mappings atomically, records an audit event, and revokes stale sessions.</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setReview(false)} className="rounded-lg border px-4 py-3 text-sm font-bold">Back to edit</button><button type="button" disabled={busy} onClick={save} className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white">{busy ? "Saving…" : "Save Project access"}</button></div></div></div>}
  </div>;
}

function Change({ title, names }: { title: string; names: string[] }) { return <div className="rounded-lg border p-3"><h3 className="text-sm font-bold">{title}</h3><p className="mt-2 text-xs text-slate-500">{names.join(", ") || "No changes"}</p></div>; }
