import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ModuleRestricted from "@/components/ModuleRestricted";
import ProjectFormPrototype from "@/components/ProjectFormPrototype";
import ProjectStatusControl from "@/components/ProjectStatusControl";
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
  if (normalizeProjectStatus(project.status) !== "active") return <div className="mx-auto max-w-4xl space-y-6 pb-10"><h1 className="text-3xl font-bold text-slate-950">Edit {project.name}</h1><ProjectStatusControl project={project} /><Link href={`/projects/${project.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Back to Project</Link></div>;
  return <ProjectFormPrototype mode="edit" project={project} projectTypes={listProjectTypes(actor.companyId).map(({ id: projectTypeId, name }) => ({ id: projectTypeId, name }))} availableUsers={listProjectUsers(actor.companyId, project.id)} />;
}
