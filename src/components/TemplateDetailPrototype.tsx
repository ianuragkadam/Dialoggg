import Link from "next/link";

import type { ProjectTemplateUiItem } from "@/lib/project-templates-ui";

export default function TemplateDetailPrototype({ template }: { template: ProjectTemplateUiItem }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight text-slate-950">{template.name}</h1><p className="mt-2 text-sm text-slate-600">Saved from {template.sourceProject} · Updated {template.updatedLabel}</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/templates" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600">Back to Library</Link><Link href={`/templates/${template.id}/use`} className="inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600">Use Template</Link></div>
      </div>

      <section aria-label="Template editing boundary" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><p className="font-semibold">Read-only Template Plan</p><p>This view shows the saved content. Update Template content by recreating it from a Project Plan; v1 has no separate Template schedule editor.</p></section>

      <section aria-label="Template summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Tasks</p><p className="mt-1 text-2xl font-bold text-slate-950">{template.taskCount}</p><p className="text-xs text-slate-500">including {template.headerCount} Headers</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Plan length</p><p className="mt-1 text-2xl font-bold text-slate-950">{template.workingDays}</p><p className="text-xs text-slate-500">working days</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Resource Categories</p><p className="mt-1 text-2xl font-bold text-slate-950">{template.categoryCount}</p><p className="text-xs text-slate-500">company defaults</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"><p className="text-sm text-emerald-800">Starting progress</p><p className="mt-1 text-2xl font-bold text-emerald-950">0%</p><p className="text-xs text-emerald-800">for every Task</p></div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="template-plan-title">
        <div className="border-b border-slate-200 p-5"><h2 id="template-plan-title" className="font-bold text-slate-950">Saved Project Plan</h2><p className="mt-1 text-sm text-slate-500">All rows show relative working-day offsets instead of fixed calendar dates.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px]"><thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Task or Header</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Starts</th><th className="px-5 py-3">Duration</th><th className="px-5 py-3">Default category</th></tr></thead><tbody className="divide-y divide-slate-200">{template.tasks.map((task, index) => <tr key={`${task.name}-${index}`}><td className="px-5 py-4 font-semibold text-slate-950">{task.name}</td><td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${task.kind === "Header" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-700"}`}>{task.kind}</span></td><td className="px-5 py-4 text-sm text-slate-600">{task.offset}</td><td className="px-5 py-4 text-sm text-slate-600">{task.duration}</td><td className="px-5 py-4 text-sm text-slate-600">{task.category}</td></tr>)}</tbody></table></div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Saved scheduling rules</h2><dl className="mt-4 space-y-3 text-sm"><div><dt className="font-semibold text-slate-700">Weekend behavior</dt><dd className="mt-1 text-slate-600">{template.weekendRule}</dd></div><div><dt className="font-semibold text-slate-700">Task colors</dt><dd className="mt-1 text-slate-600">{template.colorCount} saved color choices</dd></div><div><dt className="font-semibold text-slate-700">Dependencies</dt><dd className="mt-1 text-slate-600">Links, non-negative lag, branches, and independent offsets retained</dd></div></dl></section>
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm"><h2 className="font-bold text-amber-950">Not copied into a new Project</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-amber-950"><li>• Fixed calendar dates from {template.sourceProject}</li><li>• Task completion or Project status</li><li>• Client contact details, address, notes, or Events</li><li>• Exact Resources unless the save-time option is deliberately enabled</li></ul></section>
      </div>
    </div>
  );
}
