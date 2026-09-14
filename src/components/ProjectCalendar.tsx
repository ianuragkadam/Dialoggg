"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useEffect, useState } from "react";
import SubscribeButton from "@/components/SubscribeButton";

type Evt = { id: string; title: string; start: string; end: string; color: string };

export default function ProjectCalendar({ projectId }: { projectId: number }) {
  const [events, setEvents] = useState<Evt[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/events`)
      .then(r => r.json())
      .then(j => setEvents(j.events || []));
  }, [projectId]);

  return (
    <div className="bg-white border rounded shadow-sm p-4">
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold">Project Calendar</h2>
        <div className="flex items-center gap-3">
          <SubscribeButton feedUrlEndpoint={`/api/projects/${projectId}/feed-url`} />
          <div className="text-xs text-gray-500">Shows Tasks and Events.</div>
        </div>
      </div>
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,dayGridWeek" }}
        events={events as any}
        height={650}
      />
    </div>
  );
}
