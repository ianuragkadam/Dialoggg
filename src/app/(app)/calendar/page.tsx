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

type Project = { id: number; name: string; project_type_id: number; project_type: string };

export default function MasterCalendarPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectId, setProjectId] = useState<string>("all");
  const [selectedProjectTypeIds, setSelectedProjectTypeIds] = useState<number[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [companyTimeZone,setCompanyTimeZone]=useState("UTC");
  const [includeCompleted,setIncludeCompleted]=useState(false);
  const [notice,setNotice]=useState("");
  const [selectedEvent,setSelectedEvent]=useState<any>(null);
  const [openAddEvent,setOpenAddEvent]=useState<(() => void) | null>(null);
  const registerAddEvent = useCallback((open: () => void) => setOpenAddEvent(() => open), []);

  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(j => {setCanManage(["owner", "admin"].includes(j.user?.user_type));setCompanyTimeZone(j.user?.company_time_zone||"UTC");});
  }, []);

  useEffect(() => {
    fetch("/api/projects").then(r => r.json()).then(j => {
      const next = (j.projects || []) as Project[];
      setProjects(next);
      setSelectedProjectTypeIds([...new Set(next.map(project => project.project_type_id))]);
      setProjectsLoaded(true);
    });
  }, []);

  const loadEvents=useCallback(() => {
    if (!projectsLoaded) return;
    if (projects.length && !selectedProjectTypeIds.length) { setEvents([]); return; }
    const params = new URLSearchParams();
    if (projectId !== "all") params.set("project_id", projectId);
    if(includeCompleted)params.set("include_completed","true");
    for (const typeId of selectedProjectTypeIds) params.append("project_type_id", String(typeId));
    const query = params.toString();
    fetch(query ? `/api/calendar?${query}` : "/api/calendar").then(r => r.json()).then(j => setEvents(j.events || []));
  }, [projectId, selectedProjectTypeIds, projects.length, projectsLoaded,includeCompleted]);
  useEffect(() => {loadEvents();}, [loadEvents]);
  async function moveEvent(info:any){const props=info.event.extendedProps;if(props.kind!=="event"){info.revert();return;}const start=info.event.startStr,end=info.event.endStr||start;if(!window.confirm(`Move ${info.event.title} to ${start}? Cancel returns it to the original position.`)){info.revert();return;}info.revert();const replacement=info.event.allDay?{startDate:start.slice(0,10),endDate:new Date(Date.parse(end)-86400000).toISOString().slice(0,10)}:{startAt:info.event.start?.toISOString(),endAt:info.event.end?.toISOString()};async function save(confirmConflicts=false){const response=await authenticatedFetch(`/api/events/${props.seriesId}/exceptions`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({version:props.version,occurrenceKey:props.occurrenceKey,action:"replace",replacement,confirmConflicts})});const data=await response.json();if(response.status===409&&data?.error?.code==="RESOURCE_CONFLICT"&&!confirmConflicts){if(window.confirm("This move overlaps another Resource assignment. Keep the assignment anyway?"))await save(true);return;}setNotice(response.ok?"Event moved after confirmation. All applicable calendars were refreshed.":data?.error?.message||"The Event could not be moved.");if(response.ok)loadEvents();}await save();}

  const projectTypes = [...new Map(projects.map(project => [project.project_type_id, { id: project.project_type_id, name: project.project_type }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Master Calendar</h1>
        <div className="flex items-center gap-3">
          <SubscribeButton feedUrlEndpoint="/api/calendar/feed-url" />
        </div>
      </div>
      <CalendarWorkflowReview
        context="master"
        canManage={canManage}
        projectId={projectId}
        projects={projects}
        onProjectIdChange={setProjectId}
        projectTypes={projectTypes}
        selectedProjectTypeIds={selectedProjectTypeIds}
        onProjectTypeIdsChange={setSelectedProjectTypeIds}
        onIncludeCompletedChange={setIncludeCompleted}
        onEventsChanged={loadEvents}
        onAddEventReady={registerAddEvent}
      >
      {notice&&<div role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}
      <div className="bg-white border rounded shadow-sm p-4">
        <FullCalendar
          plugins={[dayGridPlugin,interactionPlugin,luxonPlugin]}
          initialView="dayGridMonth"
          customButtons={openAddEvent ? { addEventButton: { text: "+ Add Event", hint: "Add an Event", click: () => openAddEvent() } } : undefined}
          headerToolbar={{ left: "prev,next today", center: "title", right: `${openAddEvent ? "addEventButton " : ""}dayGridMonth,dayGridWeek,dayGridDay` }}
          events={events}
          timeZone={companyTimeZone}
          editable={canManage}
          eventDrop={moveEvent}
          eventClick={info=>{if(info.event.extendedProps.kind==="event")setSelectedEvent(info.event);}}
          height={650}
        />
      </div>
      </CalendarWorkflowReview>
      {selectedEvent&&<EventOccurrenceDialog event={selectedEvent} canManage={canManage} onClose={()=>setSelectedEvent(null)} onChanged={loadEvents}/>}
    </div>
  );
}
