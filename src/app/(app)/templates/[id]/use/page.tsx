import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ModuleRestricted from "@/components/ModuleRestricted";
import TemplateUsePrototype from "@/components/TemplateUsePrototype";
import { getCurrentActor } from "@/lib/auth";
import { getProjectTemplate } from "@/lib/project-templates";
import { listProjectTypes } from "@/lib/project-types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const actor = await getCurrentActor();
  const template = actor?.contextType === "company" && actor.companyId && ["owner", "admin"].includes(actor.companyRole ?? "") ? getProjectTemplate(Number((await params).id), actor.companyId) : null;
  return { title: template ? `Use ${template.name} | Dialoggg` : "Template not found | Dialoggg" };
}

export default async function UseProjectTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId || !["owner", "admin"].includes(actor.companyRole ?? "")) return <ModuleRestricted title="Project Templates are restricted" description="Only an Owner or Admin can start a Project from a Template." />;
  const template = getProjectTemplate(Number((await params).id), actor.companyId);
  if (!template) notFound();
  return <TemplateUsePrototype template={template} projectTypes={listProjectTypes(actor.companyId).map(({ id, name }) => ({ id, name }))} />;
}
