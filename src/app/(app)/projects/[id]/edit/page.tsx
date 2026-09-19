import { notFound, redirect } from "next/navigation";
import ModuleRestricted from "@/components/ModuleRestricted";
import ProjectFormPrototype from "@/components/ProjectFormPrototype";
import { getCurrentActor } from "@/lib/auth";
import { getProjectRecord, listProjectUsers } from "@/lib/projects";
import { normalizeProjectStatus } from "@/lib/projects-ui";
import { listProjectTypes } from "@/lib/project-types";

export const metadata = { title: "Edit Project | Dialoggg" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !["owner", "admin"].includes(actor.companyRole || "")) return <ModuleRestricted title="Project management is restricted" description="Only an Owner or Admin can edit a Project or change its Start Date." />;
  const project = getProjectRecord(Number(id), actor.companyId);
  if (!project) notFound();
  if (normalizeProjectStatus(project.status) !== "active") return <ModuleRestricted title="Project is read-only" description={`${normalizeProjectStatus(project.status) === "completed" ? "Reopen" : "Restore"} this Project before editing its details or Start Date.`} />;
  return <ProjectFormPrototype mode="edit" project={project} projectTypes={listProjectTypes(actor.companyId).map(({ id: projectTypeId, name }) => ({ id: projectTypeId, name }))} availableUsers={listProjectUsers(actor.companyId, project.id)} />;
}
