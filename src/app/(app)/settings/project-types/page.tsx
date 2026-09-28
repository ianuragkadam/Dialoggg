import type { Metadata } from "next";
import Link from "next/link";

import ProjectTypesPrototype from "@/components/ProjectTypesPrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { countProjectsMissingType, listProjectTypes } from "@/lib/project-types";

export const metadata: Metadata = {
  title: "Project Types | Dialoggg",
};

export default async function ProjectTypesPage() {
  const user = await getCurrentUser();

  if (!isAdmin(user)) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">🔒</div>
        <h1 className="mt-4 text-2xl font-bold text-slate-950">Project Types are restricted</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Only an Owner or Admin can manage the company&apos;s Project Types. No settings have been changed.
        </p>
        <Link href="/projects" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
          Back to All Projects
        </Link>
      </div>
    );
  }

  const projectTypes = listProjectTypes(user!.company_id!).map(item => ({
    ...item,
    updatedLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${item.updatedAt.replace(" ", "T")}Z`)),
  }));

  return <ProjectTypesPrototype initialItems={projectTypes} initialMissingTypeCount={countProjectsMissingType(user!.company_id!)} />;
}
