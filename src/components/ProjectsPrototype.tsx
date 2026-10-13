"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatProjectDate, normalizeProjectStatus, projectTypeFor, type ProjectUiRecord, type ProjectUiStatus } from "@/lib/projects-ui";
import PaginationControls, { pageItems } from "@/components/PaginationControls";
import HowItWorks from "@/components/HowItWorks";
import { PROJECT_DIRECTORY_GUIDE } from "@/lib/how-it-works-guides";

type StatusFilter = "all" | ProjectUiStatus;
export default function ProjectsPrototype({ projects, projectTypes, canManage, external = false }: { projects: ProjectUiRecord[]; projectTypes: string[]; canManage: boolean; external?: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [page, setPage] = useState(1);
  const [types, setTypes] = useState<string[]>(projectTypes);
  const filtered = useMemo(() => projects.filter(project => {
    const matchesQuery = `${project.name} ${project.client_name || ""} ${projectTypeFor(project)}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (status === "all" || normalizeProjectStatus(project.status) === status) && types.includes(projectTypeFor(project));
  }), [projects, query, status, types]);
  const visible = pageItems(filtered, page);
  useEffect(() => { setPage(1); }, [query, status, types]);
  const counts = { active: projects.filter(project => normalizeProjectStatus(project.status) === "active").length, archived: projects.filter(project => normalizeProjectStatus(project.status) === "archived").length };

  return <div className="mx-auto max-w-7xl space-y-6 pb-10">
    <div><h1 className="text-4xl font-bold text-slate-950 sm:text-5xl">Projects</h1></div>
    <HowItWorks items={PROJECT_DIRECTORY_GUIDE} />
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="project-directory-title">
      <div className="space-y-4 border-b border-slate-200 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h2 id="project-directory-title" className="text-xl font-bold uppercase tracking-wide text-slate-950 sm:text-2xl">DIRECTORY</h2>
          {canManage && <Link href="/projects/new" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800">+ Add Project</Link>}
        </div>
        <section aria-label="Project summary" className="grid grid-cols-2 gap-2 sm:max-w-md"><Summary label="Active" value={counts.active} /><Summary label="Archived" value={counts.archived} /></section>
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_190px]"><label className="sr-only" htmlFor="project-search">Search Projects</label><input id="project-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search Project, client, or type" className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" /><label className="sr-only" htmlFor="project-status">Filter Projects by status</label><select id="project-status" value={status} onChange={event => setStatus(event.target.value as StatusFilter)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="all">All jobs</option><option value="active">Active</option><option value="archived">Archived</option></select></div>
        <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-3"><legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Filter Projects by Project Type</legend><div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">{projectTypes.map(item => <label key={item} className="text-sm"><input type="checkbox" checked={types.includes(item)} onChange={() => setTypes(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])} className="mr-2"/>{item}</label>)}<button type="button" onClick={() => setTypes(projectTypes)} className="min-h-10 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-blue-700">All</button></div></fieldset>
      </div>
      {!visible.length ? <div className="px-6 py-14 text-center"><h3 className="font-bold text-slate-950">No matching Projects</h3><p className="mt-1 text-sm text-slate-500">Change the search, status, or Project Type filters.</p><button type="button" onClick={() => { setQuery(""); setStatus("all"); setTypes(projectTypes); }} className="mt-4 min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Clear filters</button></div> : <div className="divide-y divide-slate-200">{visible.map(project => { const projectStatus = normalizeProjectStatus(project.status); const label = projectStatus === "active" ? "Active" : "Archived"; const badge = projectStatus === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"; return <article key={project.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(230px,1.2fr)_170px_140px_190px_auto] lg:items-center"><div><h3 className="font-bold text-slate-950">{project.name}</h3><p className="mt-1 text-sm text-slate-500">{project.client_name || "No client name"}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Project Type</p><p className="mt-1 text-sm font-semibold text-slate-800">{projectTypeFor(project)}</p></div><div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge}`}>{label}</span></div><div className="text-sm text-slate-600"><strong className="block text-xs uppercase tracking-wide text-slate-400">Project dates</strong>{formatProjectDate(project.start_date)}<span className="block text-xs text-slate-500">End: {formatProjectDate(project.derived_end_date || project.end_date)}</span></div><div className="flex justify-end"><Link href={`/projects/${project.id}`} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">Open</Link></div></article>; })}</div>}
      <PaginationControls page={page} totalItems={filtered.length} onPageChange={setPage} label="Projects" />
    </section>
  </div>;
}

function Summary({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="text-lg font-black leading-none text-slate-950">{value}</p></div>; }
