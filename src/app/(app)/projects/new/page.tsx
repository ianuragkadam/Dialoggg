import { redirect } from "next/navigation";
import ModuleRestricted from "@/components/ModuleRestricted";
import ProjectFormPrototype from "@/components/ProjectFormPrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const metadata = { title: "Add Project | Dialoggg" };

export default async function NewProjectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user) && user.user_type !== "owner") return <ModuleRestricted title="Project management is restricted" description="Only an Owner or Admin can add a Project." />;
  return <ProjectFormPrototype mode="create" />;
}
