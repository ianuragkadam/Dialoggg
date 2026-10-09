import type { Metadata } from "next";
import Link from "next/link";

import ModuleRestricted from "@/components/ModuleRestricted";
import ResourceConflictsReport from "@/components/ResourceConflictsReport";
import { getCurrentActor } from "@/lib/auth";

export const metadata: Metadata = { title: "Schedule Conflicts | Dialoggg" };

export default async function ResourceConflictsPage() {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId || actor.companyRole === "external") {
    return <ModuleRestricted title="Resources are restricted" description="External/Clients cannot view the company Resource directory or schedule details." />;
  }

  return <div className="mx-auto max-w-7xl space-y-6 pb-10">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href="/resources" className="text-sm font-semibold text-blue-700 hover:underline">← Resources</Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Schedule conflicts</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Review every overlapping Task or Event assigned to the same Resource. Nothing is changed automatically.</p>
      </div>
      <Link href="/resources/schedule" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Open Resource Calendar</Link>
    </div>
    <ResourceConflictsReport timeZone={actor.companyTimeZone || "UTC"} />
  </div>;
}
