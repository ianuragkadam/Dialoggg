import type { Metadata } from "next";

import ModuleRestricted from "@/components/ModuleRestricted";
import TemplateCreatePrototype from "@/components/TemplateCreatePrototype";
import { getCurrentActor } from "@/lib/auth";
import { listProjectTemplates, listTemplateSourceProjects } from "@/lib/project-templates";

export const metadata: Metadata = { title: "Save Project as Template | Dialoggg" };

export default async function NewProjectTemplatePage() {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId || !["owner", "admin"].includes(actor.companyRole ?? "")) return <ModuleRestricted title="Project Templates are restricted" description="Only an Owner or Admin can save a Project Plan as a Template." />;
  return <TemplateCreatePrototype sourceProjects={listTemplateSourceProjects(actor.companyId)} existingNames={listProjectTemplates(actor.companyId).map(template => template.name)} />;
}
