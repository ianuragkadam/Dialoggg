"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import ProjectFoldersPrototype from "@/components/ProjectFoldersPrototype";

const GanttChart = dynamic(() => import("@/components/GanttChart"), { ssr: false });
const ProjectPlanWorkflowReview = dynamic(() => import("@/components/ProjectPlanWorkflowReview"), { ssr: false });
const ProjectCalendar = dynamic(() => import("@/components/ProjectCalendar"), { ssr: false });
const ResourceSchedule = dynamic(() => import("@/components/ResourceSchedule"), { ssr: false });

type Project = {
  id: number; name: string; status: string;
  client_name: string | null; client_email: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null;
  phone: string | null; start_date: string; end_date: string | null; note: string | null;
};

const TABS = [
  { id: "details",       label: "Project Details" },
  { id: "plan",          label: "Project Plan" },
  { id: "calendar",      label: "Project Calendar" },
  { id: "resources",     label: "Project Resources" },
  { id: "folders",       label: "Common and Private" },
];

export default function ProjectTabs({
  project, internalUsers, canEdit = true, canManage = canEdit, assigned = false,
}: { project: Project; internalUsers: any[]; canEdit?: boolean; canManage?: boolean; assigned?: boolean; }) {
  // Read initial tab from URL hash (e.g. #calendar) so deep-links and refresh preserve state
  const [tab, setTab] = useState("plan");
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && TABS.some(t => t.id === hash)) setTab(hash);
  }, []);
  function selectTab(id: string) {
    setTab(id);
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <div className="space-y-3">
      <nav className="flex flex-wrap gap-1 bg-white border-b">
        {TABS.map(t => (
          <button
            key={t.id} onClick={() => selectTab(t.id)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t.id
                ? "border-blue-700 text-blue-800 font-semibold bg-blue-50"
                : "border-transparent text-gray-600 hover:text-blue-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div>
        {tab === "details" && <Details project={project} internalUsers={internalUsers} />}
        {tab === "plan"      && (
          <div className="space-y-3">
            <ProjectPlanWorkflowReview projectName={project.name} canEdit={canEdit} />
            <GanttChart projectId={project.id} canEdit={canEdit} />
          </div>
        )}
        {tab === "calendar"  && <ProjectCalendar projectId={project.id} canManage={canEdit} projectName={project.name} />}
        {tab === "resources" && <ResourceSchedule projectId={project.id} />}
        {tab === "folders" && <ProjectFoldersPrototype projectId={project.id} projectName={project.name} canManage={canManage} canEdit={canEdit} assigned={assigned} />}
      </div>
    </div>
  );
}

function Details({ project, internalUsers }: { project: Project; internalUsers: any[] }) {
  const row = (label: string, value: any) => (
    <div className="flex border-b py-2">
      <div className="w-40 text-sm text-gray-500">{label}</div>
      <div className="flex-1 text-sm">{value || <span className="text-gray-300">—</span>}</div>
    </div>
  );
  return (
    <div className="bg-white border rounded shadow-sm p-6 max-w-2xl">
      <h2 className="font-semibold mb-4">Project Details</h2>
      {row("Project Name", project.name)}
      {row("Status", project.status)}
      {row("Start Date", project.start_date)}
      {row("End Date", project.end_date)}
      {row("Client Name", project.client_name)}
      {row("Client Email", project.client_email)}
      {row("Address",
        [project.address, project.city, project.state, project.zip].filter(Boolean).join(", "))}
      {row("Phone", project.phone)}
      {row("Notes", project.note)}
      {row("Internal Users",
        internalUsers.length ? internalUsers.map(u => u.full_name || u.email).join(", ") : "—")}
    </div>
  );
}
