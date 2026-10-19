"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import { useCallback, useEffect, useRef, useState } from "react";
import SubscribeButton from "@/components/SubscribeButton";
import CalendarWorkflowReview from "@/components/CalendarWorkflowReview";
import { authenticatedFetch } from "@/lib/client-fetch";
import EventOccurrenceDialog from "@/components/EventOccurrenceDialog";
import TaskOccurrenceDialog from "@/components/TaskOccurrenceDialog";
import TimedNotice from "@/components/TimedNotice";
import { calendarEventTooltip } from "@/lib/calendar-tooltip";
import CalendarEventTooltip, { CalendarTooltipProvider } from "@/components/CalendarEventTooltip";
import MasterCalendarPrintDialog from "@/components/MasterCalendarPrintDialog";

type Project = { id: number; name: string; project_type_id: number; project_type: string; status: string };

export default function MasterCalendarPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectTypes, setProjectTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectId, setProjectId] = useState<string>("all");
  const [selectedProjectTypeIds, setSelectedProjectTypeIds] = useState<number[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [companyTimeZone,setCompanyTimeZone]=useState("UTC");
  const [includeArchived,setIncludeArchived]=useState(false);
  const [notice,setNotice]=useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [selectedEvent,setSelectedEvent]=useState<any>(null);
  const [selectedTask,setSelectedTask]=useState<any>(null);
  const [showPrintDialog,setShowPrintDialog]=useState(false);
  const [printRange,setPrintRange]=useState({ start: new Date().toISOString().slice(0,10), end: new Date(Date.now()+31*86400000).toISOString().slice(0,10), focus: new Date().toISOString().slice(0,10) });
  const calendarRef=useRef<any>(null);
  const [openAddEvent,setOpenAddEvent]=useState<(() => void) | null>(null);
  const registerAddEvent = useCallback((open: () => void) => setOpenAddEvent(() => open), []);

  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(j => {setCanManage(["owner", "admin"].includes(j.user?.user_type));setCompanyTimeZone(j.user?.company_time_zone||"UTC");});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects", { cache: "no-store" }).then(response => response.json()),
      fetch("/api/calendar/project-types", { cache: "no-store" }).then(response => response.json()),
    ]).then(([projectData, typeData]) => {
      const nextProjects = (projectData.projects || []) as Project[];
      const nextTypes = (typeData.projectTypes || []) as Array<{ id: number; name: string }>;
      setProjects(nextProjects);
      setProjectTypes(nextTypes);
      setSelectedProjectTypeIds(nextTypes.map(type => type.id));
      setProjectsLoaded(true);
    }).catch(() => setProjectsLoaded(true));
  }, []);

  const loadEvents=useCallback(() => {
    if (!projectsLoaded) return;
    if (projects.length && !selectedProjectTypeIds.length) { setEvents([]); return; }
    const params = new URLSearchParams();
    if (projectId !== "all") params.set("project_id", projectId);
    if(includeArchived)params.set("include_archived","true");
    for (const typeId of selectedProjectTypeIds) params.append("project_type_id", String(typeId));
    const query = params.toString();
    fetch(query ? `/api/calendar?${query}` : "/api/calendar").then(r => r.json()).then(j => setEvents(j.events || []));
  }, [projectId, selectedProjectTypeIds, projects.length, projectsLoaded,includeArchived]);
  useEffect(() => {loadEvents();}, [loadEvents]);
  async function moveEvent(info:any){const props=info.event.extendedProps;if(props.kind!=="event"){info.revert();return;}const start=info.event.startStr,end=info.event.endStr||start;if(!window.confirm(`Move ${info.event.title} to ${start}? Cancel returns it to the original position.`)){info.revert();return;}info.revert();const replacement=info.event.allDay?{startDate:start.slice(0,10),endDate:new Date(Date.parse(end)-86400000).toISOString().slice(0,10)}:{startAt:info.event.start?.toISOString(),endAt:info.event.end?.toISOString()};async function save(confirmConflicts=false){const response=await authenticatedFetch(`/api/events/${props.seriesId}/exceptions`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({version:props.version,occurrenceKey:props.occurrenceKey,action:"replace",replacement,confirmConflicts})});const data=await response.json();if(response.status===409&&data?.error?.code==="RESOURCE_CONFLICT"&&!confirmConflicts){if(window.confirm("This move overlaps another Resource assignment. Keep the assignment anyway?"))await save(true);return;}setNotice(response.ok?{text:"Event moved after confirmation. All applicable calendars were refreshed.",tone:"success"}:{text:data?.error?.message||"The Event could not be moved.",tone:"error"});if(response.ok)loadEvents();}await save();}

  return (
    <div className="master-calendar-page space-y-4">
      <div className="master-calendar-page-header flex items-center justify-between flex-wrap gap-3">
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
        onIncludeArchivedChange={setIncludeArchived}
        onEventsChanged={loadEvents}
        onAddEventReady={registerAddEvent}
      >
      {notice&&<TimedNotice message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}
      <div className="master-calendar-print">
      <h2 className="master-calendar-print-heading">Master Calendar</h2>
      <div className="dialoggg-calendar bg-white border rounded shadow-sm p-2 sm:p-4">
        <CalendarTooltipProvider><FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin,interactionPlugin,luxonPlugin]}
          initialView="dayGridMonth"
          customButtons={{
            ...(openAddEvent ? { addEventButton: { text: "+ Add Event", hint: "Add an Event", click: () => openAddEvent() } } : {}),
            printButton: { text: "Print", hint: "Choose what to print from the Master Calendar", click: () => setShowPrintDialog(true) },
          }}
          headerToolbar={{ left: "prev,next today", center: "title", right: `${openAddEvent ? "addEventButton " : ""}printButton dayGridMonth,dayGridWeek,dayGridDay` }}
          events={events}
          eventContent={info => <CalendarEventTooltip content={calendarEventTooltip(info.event)} className="fc-event-title">{info.event.title}</CalendarEventTooltip>}
          timeZone={companyTimeZone}
          datesSet={info=>{const dateKey=(date:Date)=>{const parts=new Intl.DateTimeFormat("en-CA",{timeZone:companyTimeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);const get=(type:string)=>parts.find(part=>part.type===type)?.value??"00";return `${get("year")}-${get("month")}-${get("day")}`;};setPrintRange({start:dateKey(info.view.activeStart),end:dateKey(info.view.activeEnd),focus:dateKey(info.view.currentStart)});}}
          editable={canManage}
          eventDrop={moveEvent}
          eventClick={info=>{if(info.event.extendedProps.kind==="event")setSelectedEvent(info.event);else if(info.event.extendedProps.kind==="task")setSelectedTask(info.event);}}
          height={650}
        /></CalendarTooltipProvider>
      </div>
      </div>
      </CalendarWorkflowReview>
      <MasterCalendarPrintDialog open={showPrintDialog} onClose={()=>setShowPrintDialog(false)} jobs={projects} currentJobId={projectId} selectedProjectTypeIds={selectedProjectTypeIds} includeArchived={includeArchived} start={printRange.start} end={printRange.end} focusDate={printRange.focus} timeZone={companyTimeZone}/>
      {selectedEvent&&<EventOccurrenceDialog event={selectedEvent} canManage={canManage} onClose={()=>setSelectedEvent(null)} onChanged={loadEvents}/>}
      {selectedTask&&<TaskOccurrenceDialog event={selectedTask} projects={projects} timeZone={companyTimeZone} canManage={canManage} onClose={()=>setSelectedTask(null)}/>}
    </div>
  );
}
