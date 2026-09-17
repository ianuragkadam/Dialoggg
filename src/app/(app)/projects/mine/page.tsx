import Link from "next/link";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { statusLabel } from "@/lib/product-language";

type Project = { id: number; name: string; status: string; client_name: string | null; start_date: string };

export default async function MyProjectsPage() {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId || !actor.membershipId) redirect("/login");
  const projects = db.prepare(`
    SELECT DISTINCT p.id, p.name, p.status,
      CASE WHEN ? = 'external' THEN NULL ELSE p.client_name END AS client_name,
      p.start_date FROM project p
    JOIN project_membership pm ON pm.project_id = p.id
    WHERE pm.company_membership_id = ? AND p.company_id = ?
    ORDER BY p.created_at DESC
  `).all(actor.companyRole, actor.membershipId, actor.companyId) as Project[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My Projects</h1>
      {projects.length === 0 ? (
        <div className="bg-white p-12 rounded shadow-sm text-center text-gray-500">
          You're not assigned to any projects yet.
        </div>
      ) : (
        <div className="bg-white rounded shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-semibold">Project</th>
                <th className="text-left px-4 py-3 text-sm font-semibold">Status</th>
                <th className="text-left px-4 py-3 text-sm font-semibold">Client</th>
                <th className="text-left px-4 py-3 text-sm font-semibold">Start</th>
                <th className="text-left px-4 py-3 text-sm font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-sm">{statusLabel(p.status)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.client_name || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.start_date}</td>
                  <td className="px-4 py-3"><Link className="text-blue-700 hover:underline" href={`/projects/${p.id}`}>View →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
