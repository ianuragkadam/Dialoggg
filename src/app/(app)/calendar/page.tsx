"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import { useEffect, useState } from "react";
import SubscribeButton from "@/components/SubscribeButton";

type Project = { id: number; name: string };

export default function MasterCalendarPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("all");

  useEffect(() => {
    fetch("/api/projects").then(r => r.json()).then(j => setProjects(j.projects || []));
  }, []);

  useEffect(() => {
    const url = projectId === "all" ? "/api/calendar" : `/api/calendar?project_id=${projectId}`;
    fetch(url).then(r => r.json()).then(j => setEvents(j.events || []));
  }, [projectId]);

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
      <div className="bg-white border rounded shadow-sm p-4">
        <FullCalendar
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,dayGridWeek" }}
          events={events}
          height={650}
        />
      </div>
    </div>
  );
}
