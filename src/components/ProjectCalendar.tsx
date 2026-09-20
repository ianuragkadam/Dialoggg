"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import { useCallback, useEffect, useState } from "react";
import SubscribeButton from "@/components/SubscribeButton";
import CalendarWorkflowReview from "@/components/CalendarWorkflowReview";
import { authenticatedFetch } from "@/lib/client-fetch";
import EventOccurrenceDialog from "@/components/EventOccurrenceDialog";

type Evt = { id: string; title: string; start: string; end: string; color: string };

export default function ProjectCalendar({ projectId, canManage = true, projectName }: { projectId: number; canManage?: boolean; projectName?: string }) {
  const [events, setEvents] = useState<Evt[]>([]);
  const [notice,setNotice]=useState("");
  const [selectedEvent,setSelectedEvent]=useState<any>(null);
  const [companyTimeZone,setCompanyTimeZone]=useState("UTC");

  const reload=useCallback(() => {
    fetch(`/api/projects/${projectId}/events`)
      .then(r => r.json())
      .then(j => setEvents(j.events || []));
  }, [projectId]);
  useEffect(() => {reload();}, [reload]);
  useEffect(()=>{fetch("/api/me").then(response=>response.json()).then(data=>setCompanyTimeZone(data.user?.company_time_zone||"UTC"));},[]);
  async function moveEvent(info:any){const props=info.event.extendedProps;if(props.kind!=="event"){info.revert();return;}const start=info.event.startStr,end=info.event.endStr||start;if(!window.confirm(`Move ${info.event.title} to ${start}? Cancel returns it to the original position.`)){info.revert();return;}info.revert();const allDay=info.event.allDay;const replacement=allDay?{startDate:start.slice(0,10),endDate:new Date(Date.parse(end)-86400000).toISOString().slice(0,10)}:{startAt:info.event.start?.toISOString(),endAt:info.event.end?.toISOString()};async function save(confirmConflicts=false){const response=await authenticatedFetch(`/api/events/${props.seriesId}/exceptions`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({version:props.version,occurrenceKey:props.occurrenceKey,action:"replace",replacement,confirmConflicts})});const data=await response.json();if(response.status===409&&data?.error?.code==="RESOURCE_CONFLICT"&&!confirmConflicts){if(window.confirm("This move overlaps another Resource assignment. Keep the assignment anyway?"))await save(true);return;}if(!response.ok){setNotice(data?.error?.message||"The Event could not be moved.");return;}setNotice("Event moved after confirmation. All applicable calendars now use the new occurrence time.");reload();}await save();}

  return (
    <div className="space-y-3">
      <CalendarWorkflowReview context="project" canManage={canManage} projectId={projectId} projectName={projectName} onEventsChanged={reload} />
      {notice&&<div role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}
      <div className="bg-white border rounded shadow-sm p-4">
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold">Project Calendar</h2>
        <div className="flex items-center gap-3">
          <SubscribeButton feedUrlEndpoint={`/api/projects/${projectId}/feed-url`} />
          <div className="text-xs text-gray-500">Shows Tasks and Events.</div>
        </div>
      </div>
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin, luxonPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,dayGridWeek,dayGridDay" }}
        events={events as any}
        timeZone={companyTimeZone}
        editable={canManage}
        eventDrop={moveEvent}
        eventClick={info=>{if(info.event.extendedProps.kind==="event")setSelectedEvent(info.event);}}
        height={650}
      />
      </div>
      {selectedEvent&&<EventOccurrenceDialog event={selectedEvent} canManage={canManage} onClose={()=>setSelectedEvent(null)} onChanged={reload}/>}
    </div>
  );
}
