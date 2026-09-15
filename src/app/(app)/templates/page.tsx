import type { Metadata } from "next";

import ModuleRestricted from "@/components/ModuleRestricted";
import ProjectTemplatesPrototype from "@/components/ProjectTemplatesPrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Project Templates | Dialoggg" };

export default async function ProjectTemplatesPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return <ModuleRestricted title="Project Templates are restricted" description="Only an Owner or Admin can manage the company's Project Templates." />;
  return <ProjectTemplatesPrototype />;
}
