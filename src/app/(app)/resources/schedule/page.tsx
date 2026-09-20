"use client";

import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import { useEffect, useState } from "react";
import CalendarWorkflowReview from "@/components/CalendarWorkflowReview";

type Resource = { id: string; title: string };
type Evt = {
  id: string; resourceId: string; title: string;
  start: string; end: string; color: string;
  extendedProps: { conflict: boolean; project_id: number };
};

export default function GlobalResourceSchedulePage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [events, setEvents] = useState<Evt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [companyTimeZone,setCompanyTimeZone]=useState("UTC");

  useEffect(() => {
    fetch("/api/resources/schedule").then(r => r.json()).then(j => {
      setResources(j.resources || []);
      setEvents(j.events || []);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(j => {setCanManage(["owner", "admin"].includes(j.user?.user_type));setCompanyTimeZone(j.user?.company_time_zone||"UTC");});
  }, []);

  const conflictCount = events.filter(e => e.extendedProps.conflict).length / 2;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Resource Calendar</h1>
        <div className="text-sm">
          {conflictCount > 0 ? (
            <span className="bg-red-100 text-red-800 px-3 py-1 rounded">
              ⚠️ {conflictCount} overlap{conflictCount === 1 ? "" : "s"} — same resource booked twice
            </span>
          ) : (
            <span className="bg-green-100 text-green-800 px-3 py-1 rounded">✓ No scheduling conflicts</span>
          )}
        </div>
      </div>
      <CalendarWorkflowReview context="resource" canManage={canManage} projectId={events[0]?.extendedProps.project_id} />
      <div className="bg-white border rounded shadow-sm p-4">
        {!loaded ? <div className="text-gray-500">Loading…</div> : (
          <FullCalendar
            plugins={[resourceTimelinePlugin, interactionPlugin, luxonPlugin]}
            initialView="resourceTimelineMonth"
            headerToolbar={{ left: "prev,next today", center: "title", right: "resourceTimelineMonth,resourceTimelineWeek,resourceTimelineDay" }}
            resources={resources as any}
            events={events as any}
            timeZone={companyTimeZone}
            resourceAreaHeaderContent="Resources"
            resourceAreaWidth="20%"
            height={650}
            schedulerLicenseKey="GPL-My-Project-Is-Open-Source"
          />
        )}
      </div>
    </div>
  );
}
