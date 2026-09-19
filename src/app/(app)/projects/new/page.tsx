import { redirect } from "next/navigation";
import ModuleRestricted from "@/components/ModuleRestricted";
import ProjectFormPrototype from "@/components/ProjectFormPrototype";
import { getCurrentActor } from "@/lib/auth";
import { listProjectTemplates } from "@/lib/project-templates";
import { listProjectUsers } from "@/lib/projects";
import { listProjectTypes } from "@/lib/project-types";

export const metadata = { title: "Add Project | Dialoggg" };

export default async function NewProjectPage() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !["owner", "admin"].includes(actor.companyRole || "")) return <ModuleRestricted title="Project management is restricted" description="Only an Owner or Admin can add a Project." />;
  return <ProjectFormPrototype
    mode="create"
    projectTypes={listProjectTypes(actor.companyId).map(({ id, name }) => ({ id, name }))}
    availableUsers={listProjectUsers(actor.companyId)}
    templates={listProjectTemplates(actor.companyId).map(({ id, name }) => ({ id, name }))}
  />;
}
