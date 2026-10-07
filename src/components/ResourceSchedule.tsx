"use client";

import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import { useEffect, useState } from "react";

type Resource = { id: string; title: string };
type Evt = { id: string; resourceId: string; title: string; start: string; end: string; color: string };

export default function ResourceSchedule({ projectId }: { projectId: number }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [events, setEvents] = useState<Evt[]>([]);
  const [companyTimeZone,setCompanyTimeZone]=useState("UTC");

  useEffect(() => {
    fetch(`/api/projects/${projectId}/resource-schedule`)
      .then(r => r.json())
      .then(j => { setResources(j.resources || []); setEvents(j.events || []); });
  }, [projectId]);
  useEffect(()=>{fetch("/api/me").then(response=>response.json()).then(data=>setCompanyTimeZone(data.user?.company_time_zone||"UTC"));},[]);

  return (
    <div className="dialoggg-calendar dialoggg-calendar-timeline bg-white border rounded shadow-sm p-2 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Project Resources</h2>
        <div className="text-xs text-gray-500">Each row represents a Resource; bars show its assigned Tasks.</div>
      </div>
      <FullCalendar
        plugins={[resourceTimelinePlugin, interactionPlugin, luxonPlugin]}
        initialView="resourceTimelineMonth"
        headerToolbar={{ left: "prev,next today", center: "title", right: "resourceTimelineMonth,resourceTimelineWeek" }}
        resources={resources as any}
        events={events as any}
        timeZone={companyTimeZone}
        resourceAreaHeaderContent="Resources"
        resourceAreaWidth="20%"
        height={650}
        schedulerLicenseKey="GPL-My-Project-Is-Open-Source"
      />
    </div>
  );
}
