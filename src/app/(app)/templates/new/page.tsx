import type { Metadata } from "next";

import ModuleRestricted from "@/components/ModuleRestricted";
import TemplateCreatePrototype from "@/components/TemplateCreatePrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Save Project as Template | Dialoggg" };

export default async function NewProjectTemplatePage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return <ModuleRestricted title="Project Templates are restricted" description="Only an Owner or Admin can save a Project Plan as a Template." />;
  return <TemplateCreatePrototype />;
}
