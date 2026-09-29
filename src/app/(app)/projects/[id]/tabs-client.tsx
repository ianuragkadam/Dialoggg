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
            <ProjectPlanGuide />
          </div>
        )}
        {tab === "calendar"  && <ProjectCalendar projectId={project.id} canManage={canEdit} projectName={project.name} />}
        {tab === "resources" && <ResourceSchedule projectId={project.id} />}
        {tab === "folders" && <ProjectFoldersPrototype projectId={project.id} projectName={project.name} canManage={canManage} canEdit={canEdit} assigned={assigned} />}
      </div>
    </div>
  );
}

function ProjectPlanGuide() {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-sm">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="project-plan-gantt-guide-content"
          onClick={() => setOpen(value => !value)}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-inset"
        >
          <span>Project Plan / Gantt Chart Guide</span>
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800">
            <svg viewBox="0 0 24 24" className={`h-5 w-5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
      </h2>
      <div id="project-plan-gantt-guide-content" hidden={!open} className="border-t border-slate-700 px-5 py-4">
          <ul className="grid gap-3 text-sm leading-6 md:grid-cols-2">
            <li><strong>Editing and moving Tasks:</strong> Double-click a row or bar to edit it. Drag a bar to reschedule it, or drag from its edge circle to another Task to create a dependency.</li>
            <li><strong>Duration and dates:</strong> Duration counts allowed working days and includes the start and end dates. Weekend days count only when enabled for that Task.</li>
            <li><strong>Dependencies:</strong> Finish-to-Start, Start-to-Start, Finish-to-Finish, and Start-to-Finish links are supported. Zero-lag Finish-to-Start begins on the next allowed workday.</li>
            <li><strong>Multiple links and changes:</strong> When a Task has multiple predecessors, the latest valid constraint applies. Schedule changes cascade through dependent successor Tasks.</li>
            <li><strong>Linked Task dragging:</strong> Moving a linked Task keeps its dependency and recalculates a non-negative lag.</li>
            <li><strong>Header and Project dates:</strong> Header dates span descendant Tasks; progress is weighted by leaf-Task duration. The root Header Task determines the Project End Date.</li>
          </ul>
          <p className="mt-4 text-xs text-slate-400">Changes made in the Gantt are saved to this Project Plan.</p>
      </div>
    </section>
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
