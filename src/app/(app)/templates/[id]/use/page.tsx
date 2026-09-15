import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ModuleRestricted from "@/components/ModuleRestricted";
import TemplateUsePrototype from "@/components/TemplateUsePrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { findProjectTemplateUi } from "@/lib/project-templates-ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const template = findProjectTemplateUi((await params).id);
  return { title: template ? `Use ${template.name} | Dialoggg` : "Template not found | Dialoggg" };
}

export default async function UseProjectTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return <ModuleRestricted title="Project Templates are restricted" description="Only an Owner or Admin can start a Project from a Template." />;
  const template = findProjectTemplateUi((await params).id);
  if (!template) notFound();
  return <TemplateUsePrototype template={template} />;
}
