import { notFound, redirect } from "next/navigation";
import db from "@/db";
import ModuleRestricted from "@/components/ModuleRestricted";
import ProjectFormPrototype from "@/components/ProjectFormPrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import type { ProjectUiRecord } from "@/lib/projects-ui";
import { normalizeProjectStatus } from "@/lib/projects-ui";

export const metadata = { title: "Edit Project | Dialoggg" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user) && user.user_type !== "owner") return <ModuleRestricted title="Project management is restricted" description="Only an Owner or Admin can edit a Project or change its Start Date." />;
  const project = db.prepare(`SELECT p.*, COUNT(t.id) AS task_count, SUM(CASE WHEN t.progress >= 1 THEN 1 ELSE 0 END) AS completed_task_count FROM project p LEFT JOIN task t ON t.project_id = p.id WHERE p.id = ? AND p.company_id = ? GROUP BY p.id`).get(Number(id), user.company_id) as ProjectUiRecord | undefined;
  if (!project) notFound();
  if (normalizeProjectStatus(project.status) !== "active") return <ModuleRestricted title="Project is read-only" description={`${normalizeProjectStatus(project.status) === "completed" ? "Reopen" : "Restore"} this Project before editing its details or Start Date.`} />;
  return <ProjectFormPrototype mode="edit" project={project} />;
}
