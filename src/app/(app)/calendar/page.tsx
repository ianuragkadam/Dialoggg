"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import { useEffect, useState } from "react";
import SubscribeButton from "@/components/SubscribeButton";
import CalendarWorkflowReview from "@/components/CalendarWorkflowReview";

type Project = { id: number; name: string; project_type_id: number; project_type: string };

export default function MasterCalendarPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectId, setProjectId] = useState<string>("all");
  const [selectedProjectTypeIds, setSelectedProjectTypeIds] = useState<number[]>([]);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(j => setCanManage(["owner", "admin"].includes(j.user?.user_type)));
  }, []);

  useEffect(() => {
    fetch("/api/projects").then(r => r.json()).then(j => {
      const next = (j.projects || []) as Project[];
      setProjects(next);
      setSelectedProjectTypeIds([...new Set(next.map(project => project.project_type_id))]);
      setProjectsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!projectsLoaded) return;
    if (projects.length && !selectedProjectTypeIds.length) { setEvents([]); return; }
    const params = new URLSearchParams();
    if (projectId !== "all") params.set("project_id", projectId);
    for (const typeId of selectedProjectTypeIds) params.append("project_type_id", String(typeId));
    const query = params.toString();
    fetch(query ? `/api/calendar?${query}` : "/api/calendar").then(r => r.json()).then(j => setEvents(j.events || []));
  }, [projectId, selectedProjectTypeIds, projects.length, projectsLoaded]);

  const projectTypes = [...new Map(projects.map(project => [project.project_type_id, { id: project.project_type_id, name: project.project_type }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Master Calendar</h1>
        <div className="flex items-center gap-3">
          <SubscribeButton feedUrlEndpoint="/api/calendar/feed-url" />
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Project:</span>
            <select
              value={projectId} onChange={e => setProjectId(e.target.value)}
              className="px-3 py-1.5 border rounded text-sm bg-white"
            >
              <option value="all">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
      </div>
      <CalendarWorkflowReview
        context="master"
        canManage={canManage}
        projectId={projectId === "all" ? projects[0]?.id : Number(projectId)}
        projectTypes={projectTypes}
        selectedProjectTypeIds={selectedProjectTypeIds}
        onProjectTypeIdsChange={setSelectedProjectTypeIds}
      />
      <div className="bg-white border rounded shadow-sm p-4">
        <FullCalendar
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,dayGridWeek,dayGridDay" }}
          events={events}
          height={650}
        />
      </div>
    </div>
  );
}
