import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ModuleRestricted from "@/components/ModuleRestricted";
import TemplateDetailPrototype from "@/components/TemplateDetailPrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { findProjectTemplateUi } from "@/lib/project-templates-ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const template = findProjectTemplateUi((await params).id);
  return { title: template ? `${template.name} Template | Dialoggg` : "Template not found | Dialoggg" };
}

export default async function ProjectTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return <ModuleRestricted title="Project Templates are restricted" description="Only an Owner or Admin can view Template Plan details." />;
  const template = findProjectTemplateUi((await params).id);
  if (!template) notFound();
  return <TemplateDetailPrototype template={template} />;
}
