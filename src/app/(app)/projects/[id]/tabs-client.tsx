"use client";

import { useEffect, useId, useState } from "react";
import dynamic from "next/dynamic";
import ProjectFoldersPrototype from "@/components/ProjectFoldersPrototype";
import { formatProjectDate } from "@/lib/projects-ui";
import { formatUsPhoneNumber } from "@/lib/phone-format";
import { HowItWorksHeader, HowItWorksPanel } from "@/components/HowItWorks";
import { PROJECT_PLAN_HOW_IT_WORKS } from "@/lib/how-it-works-guides";

const GanttChart = dynamic(() => import("@/components/GanttChart"), { ssr: false });
const ProjectPlanWorkflowReview = dynamic(() => import("@/components/ProjectPlanWorkflowReview"), { ssr: false });
const ProjectCalendar = dynamic(() => import("@/components/ProjectCalendar"), { ssr: false });
const ResourceSchedule = dynamic(() => import("@/components/ResourceSchedule"), { ssr: false });

type Project = {
  id: number; name: string; status: string;
  client_name: string | null; client_email: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null;
  phone: string | null; extension: string | null; start_date: string; end_date: string | null; note: string | null;
};
type ProjectUser = { full_name: string | null; email: string; role: string };

const TABS = [
  { id: "details",       label: "Project Details" },
  { id: "plan",          label: "Project Plan" },
  { id: "calendar",      label: "Project Calendar" },
  { id: "resources",     label: "Project Resources" },
  { id: "folders",       label: "Common and Private" },
];

export default function ProjectTabs({
  project, projectUsers, createdBy, identityId, canEdit = true, canManage = canEdit, assigned = false, fullScreen = false,
}: { project: Project; projectUsers: ProjectUser[]; createdBy: string | null; identityId: number; canEdit?: boolean; canManage?: boolean; assigned?: boolean; fullScreen?: boolean; }) {
  // Read initial tab from URL hash (e.g. #calendar) so deep-links and refresh preserve state
  const [tab, setTab] = useState("plan");
  useEffect(() => {
    const syncTab = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash && TABS.some(t => t.id === hash)) setTab(hash);
    };
    syncTab();
    window.addEventListener("hashchange", syncTab);
    window.addEventListener("popstate", syncTab);
    return () => { window.removeEventListener("hashchange", syncTab); window.removeEventListener("popstate", syncTab); };
  }, []);
  function selectTab(id: string) {
    setTab(id);
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <div className={fullScreen ? "h-full min-h-0" : "space-y-3"}>
      <nav className={`flex flex-wrap gap-1 bg-white border-b ${fullScreen ? "hidden" : ""}`}>
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
        {tab === "details" && <Details project={project} projectUsers={projectUsers} createdBy={createdBy} />}
        {tab === "plan"      && (
          <div className={fullScreen ? "h-full min-h-0" : "space-y-3"}>
            {!fullScreen && <ProjectPlanHowItWorks identityId={identityId} />}
            <GanttChart projectId={project.id} projectName={project.name} projectStartDate={project.start_date} userId={identityId} canEdit={canEdit} fullScreen={fullScreen} />
            {!fullScreen && <ProjectPlanWorkflowReview projectId={project.id} projectName={project.name} canEdit={canEdit} />}
            {!fullScreen && <ProjectPlanGuide />}
          </div>
        )}
        {tab === "calendar"  && <ProjectCalendar projectId={project.id} canManage={canEdit} projectName={project.name} />}
        {tab === "resources" && <ResourceSchedule projectId={project.id} projectName={project.name} />}
        {tab === "folders" && <ProjectFoldersPrototype projectId={project.id} projectName={project.name} canManage={canManage} canEdit={canEdit} assigned={assigned} />}
      </div>
    </div>
  );
}

function ProjectPlanHowItWorks({ identityId }: { identityId: number }) {
  const contentId = useId();
  const storageKey = `dialoggg:gantt-how-it-works:v1:${identityId}`;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try { setOpen(window.localStorage.getItem(storageKey) !== "false"); } catch { setOpen(true); }
  }, [storageKey]);
  function toggle() {
    setOpen(value => {
      const next = !value;
      try { window.localStorage.setItem(storageKey, String(next)); } catch {}
      return next;
    });
  }
  return <section className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm" aria-label="How It Works"><HowItWorksHeader open={open} onToggle={toggle} controlsId={contentId} />{open && <HowItWorksPanel id={contentId} items={PROJECT_PLAN_HOW_IT_WORKS} />}</section>;
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
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">Project Plan controls</h3>
            <span className="rounded-full bg-emerald-300 px-2 py-0.5 text-xs font-bold text-emerald-950">Original Gantt retained</span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium text-slate-100">Scheduling reference</span>
          </div>
          <p className="mb-4 text-sm text-slate-300">Review the scheduling rules here, then make persistent changes in the original Gantt above.</p>
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

function Details({ project, projectUsers, createdBy }: { project: Project; projectUsers: ProjectUser[]; createdBy: string | null }) {
  const internalUsers = projectUsers.filter(user => user.role !== "external");
  const externalUsers = projectUsers.filter(user => user.role === "external");
  const row = (label: string, value: any) => (
    <div className="flex border-b py-2">
      <div className="w-40 text-sm text-gray-500">{label}</div>
      <div className="flex-1 text-sm">{value || <span className="text-gray-300">—</span>}</div>
    </div>
  );
  return (
    <div className="max-w-2xl space-y-4">
      <section className="rounded border bg-white p-6 shadow-sm" aria-labelledby="project-details-heading">
        <h2 id="project-details-heading" className="mb-4 font-semibold">Project Details</h2>
        {row("Project Name", project.name)}
        {row("Created by", createdBy)}
        {row("Status", project.status)}
        {row("Start Date", formatProjectDate(project.start_date))}
        {row("End Date", formatProjectDate(project.end_date))}
        {row("Client Name", project.client_name)}
        {row("Client Email", project.client_email)}
        {row("Address",
          [project.address, project.city, project.state, project.zip].filter(Boolean).join(", "))}
        {row("Phone", project.phone ? `${formatUsPhoneNumber(project.phone)}${project.extension ? ` ext. ${project.extension}` : ""}` : project.extension ? `Ext. ${project.extension}` : null)}
        {row("Notes", project.note)}
      </section>
      <section className="rounded border bg-white p-6 shadow-sm" aria-labelledby="project-users-heading">
        <h2 id="project-users-heading" className="mb-4 font-semibold">Users</h2>
        <div className="space-y-5">
          <ProjectUserSection title="Internal Users" users={internalUsers} />
          <ProjectUserSection title="External Users" users={externalUsers} />
        </div>
      </section>
    </div>
  );
}

function ProjectUserSection({ title, users }: { title: string; users: ProjectUser[] }) {
  return <div>
    <h3 className="border-b pb-2 text-sm font-semibold">{title}</h3>
    {users.length ? <ul className="divide-y">{users.map(user => <li key={user.email} className="py-2 text-sm"><span className="font-medium">{user.full_name?.trim() || user.email}</span>{user.full_name?.trim() && <span className="ml-2 text-gray-500">{user.email}</span>}</li>)}</ul> : <p className="py-3 text-sm text-gray-500">No users assigned.</p>}
  </div>;
}
