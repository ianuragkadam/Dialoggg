import Link from "next/link";
import { redirect } from "next/navigation";
import db from "@/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { statusLabel } from "@/lib/product-language";

type Project = {
  id: number; name: string; status: string;
  client_name: string | null; start_date: string;
  created_at: string;
};

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const canEdit = isAdmin(user);
  const projects = db.prepare(
    "SELECT * FROM project WHERE company_id = ? ORDER BY created_at DESC",
  ).all(user.company_id) as Project[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">All Projects</h1>
        {canEdit && (
          <Link href="/projects/new" className="bg-blue-700 text-white px-4 py-2 rounded font-semibold hover:bg-blue-800">
            + Add Project
          </Link>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="bg-white p-12 rounded shadow-sm text-center text-gray-500">
          {canEdit
            ? <>No projects yet. Click <strong>+ Add Project</strong> to create one.</>
            : <>No projects yet.</>}
        </div>
      ) : (
        <div className="bg-white rounded shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-semibold">Project Name</th>
                <th className="text-left px-4 py-3 text-sm font-semibold">Status</th>
                <th className="text-left px-4 py-3 text-sm font-semibold">Client</th>
                <th className="text-left px-4 py-3 text-sm font-semibold">Start Date</th>
                <th className="text-left px-4 py-3 text-sm font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${
                      p.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
                    }`}>
                      {statusLabel(p.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.client_name || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.start_date}</td>
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="text-blue-700 hover:underline font-semibold text-sm">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
