import type { Metadata } from "next";

import ModuleRestricted from "@/components/ModuleRestricted";
import ProjectTemplatesPrototype from "@/components/ProjectTemplatesPrototype";
import { getCurrentActor } from "@/lib/auth";
import { listProjectTemplates } from "@/lib/project-templates";

export const metadata: Metadata = { title: "Project Templates | Dialoggg" };

export default async function ProjectTemplatesPage() {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId || !["owner", "admin"].includes(actor.companyRole ?? "")) return <ModuleRestricted title="Project Templates are restricted" description="Only an Owner or Admin can manage the company's Project Templates." />;
  return <ProjectTemplatesPrototype initialItems={listProjectTemplates(actor.companyId)} />;
}
