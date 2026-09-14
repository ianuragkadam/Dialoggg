import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import db from "@/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import ProjectTabs from "./tabs-client";
import { statusLabel } from "@/lib/product-language";

type Project = {
  id: number; name: string; status: string;
  client_name: string | null; client_email: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null;
  phone: string | null; start_date: string; end_date: string | null; note: string | null;
};

export default async function ProjectViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const project = db.prepare(
    "SELECT * FROM project WHERE id = ? AND company_id = ?",
  ).get(Number(id), user.company_id) as Project | undefined;
  if (!project) notFound();

  const internalUsers = db.prepare(`
    SELECT u.full_name, u.email FROM user u
    JOIN project_user pu ON pu.user_id = u.id
    WHERE pu.project_id = ?
  `).all(project.id) as any[];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/projects" className="hover:text-blue-700">Projects</Link>
        <span>›</span>
        <span className="text-gray-800">{project.name}</span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <div className="text-sm text-gray-600">
            {project.client_name && <>Client: <strong>{project.client_name}</strong> · </>}
            Start: <strong>{project.start_date}</strong>
            {project.end_date && <> · End: <strong>{project.end_date}</strong></>}
          </div>
        </div>
        <span className={`text-xs px-3 py-1 rounded ${
          project.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
        }`}>{statusLabel(project.status)}</span>
      </div>

      <ProjectTabs
        project={project as any}
        internalUsers={internalUsers}
        canEdit={isAdmin(user)}
      />
    </div>
  );
}
