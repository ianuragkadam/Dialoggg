import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ModuleRestricted from "@/components/ModuleRestricted";
import TemplateDetailPrototype from "@/components/TemplateDetailPrototype";
import { getCurrentActor } from "@/lib/auth";
import { getProjectTemplate } from "@/lib/project-templates";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const actor = await getCurrentActor();
  const template = actor?.contextType === "company" && actor.companyId && ["owner", "admin"].includes(actor.companyRole ?? "") ? getProjectTemplate(Number((await params).id), actor.companyId) : null;
  return { title: template ? `${template.name} Template | Dialoggg` : "Template not found | Dialoggg" };
}

export default async function ProjectTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId || !["owner", "admin"].includes(actor.companyRole ?? "")) return <ModuleRestricted title="Project Templates are restricted" description="Only an Owner or Admin can view Template Plan details." />;
  const template = getProjectTemplate(Number((await params).id), actor.companyId);
  if (!template) notFound();
  return <TemplateDetailPrototype template={template} />;
}
