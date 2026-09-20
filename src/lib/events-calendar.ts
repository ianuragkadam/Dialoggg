import db from "@/db";
import type { Actor } from "@/lib/auth";
import { addDays, workingDayEnd } from "@/lib/dates";

export class EventDomainError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: Record<string, unknown>) { super(message); }
}

type Frequency = "daily" | "weekly" | "monthly";
type TimingMode = "all_day" | "timed";
type EventRow = {
  id:number; company_id:number; project_id:number|null; title:string; description:string; color:string;
  timing_mode:TimingMode; start_date:string|null; end_date:string|null; start_at:string|null; end_at:string|null;
  time_zone:string; push_to_project:number; external_visible:number; recurrence_frequency:Frequency|null;
  recurrence_interval:number; recurrence_end_mode:"date"|"count"|"none"; recurrence_end_date:string|null;
  recurrence_count:number|null; version:number; status:string; updated_at:string;
};

export type EventOccurrence = {
  id:string; seriesId:number; occurrenceKey:string; title:string; description?:string; color:string;
  start:string; end:string; allDay:boolean; projectId:number|null; projectName:string|null; resourceIds:number[];
  recurring:boolean; version:number; externalVisible:boolean; pushToProject:boolean; timeZone:string;
};

function text(value:unknown,max=5000){return String(value??"").trim().slice(0,max);}
function date(value:unknown){const result=text(value,10);return /^\d{4}-\d{2}-\d{2}$/.test(result)&&!Number.isNaN(Date.parse(`${result}T00:00:00Z`))?result:null;}
function iso(value:unknown){const parsed=Date.parse(String(value??""));return Number.isFinite(parsed)?new Date(parsed).toISOString():null;}
function integer(value:unknown,min:number,max=1_000_000){const result=Number(value);return Number.isInteger(result)&&result>=min&&result<=max?result:null;}
function color(value:unknown){const result=text(value,20);return /^#[0-9a-f]{6}$/i.test(result)?result:"#7c3aed";}
function addCalendar(dateValue:string,frequency:Frequency,step:number){
  const [year,month,day]=dateValue.split("-").map(Number);
  if(frequency==="daily")return addDays(dateValue,step);
  if(frequency==="weekly")return addDays(dateValue,step*7);
  const target=new Date(Date.UTC(year,month-1+step,1));
  const y=target.getUTCFullYear(),m=target.getUTCMonth();
  if(day>new Date(Date.UTC(y,m+1,0)).getUTCDate())return null;
  return `${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
function localParts(instant:string,timeZone:string){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(instant));
  const get=(type:string)=>parts.find(item=>item.type===type)?.value??"00";
  return {date:`${get("year")}-${get("month")}-${get("day")}`,time:`${get("hour")}:${get("minute")}:${get("second")}`};
}
function zonedInstant(localDate:string,localTime:string,timeZone:string){
  const [y,m,d]=localDate.split("-").map(Number);const [hh,mm,ss]=localTime.split(":").map(Number);
  const desired=Date.UTC(y,m-1,d,hh,mm,ss||0);let guess=desired;
  for(let index=0;index<4;index+=1){const seen=localParts(new Date(guess).toISOString(),timeZone);const [sy,sm,sd]=seen.date.split("-").map(Number);const [sh,smin,ssec]=seen.time.split(":").map(Number);guess+=desired-Date.UTC(sy,sm-1,sd,sh,smin,ssec);}
  const result=new Date(guess).toISOString();const check=localParts(result,timeZone);
  if(check.date!==localDate||check.time.slice(0,5)!==localTime.slice(0,5))throw new EventDomainError("EVENT_LOCAL_TIME_INVALID","That local time does not exist in the Company Time Zone.");
  return result;
}
function resources(seriesId:number){return (db.prepare("SELECT resource_id FROM event_resource WHERE series_id=? ORDER BY resource_id").all(seriesId) as Array<{resource_id:number}>).map(row=>row.resource_id);}
function eventRow(companyId:number,id:number){return db.prepare("SELECT * FROM event_series WHERE id=? AND company_id=? AND status='active'").get(id,companyId) as EventRow|undefined;}
function eventDto(row:EventRow,includePrivate:boolean){return {id:row.id,project_id:row.project_id,title:row.title,...(includePrivate?{description:row.description}:{}),color:row.color,timing_mode:row.timing_mode,start_date:row.start_date,end_date:row.end_date,start_at:row.start_at,end_at:row.end_at,time_zone:row.time_zone,push_to_project:row.push_to_project,external_visible:row.external_visible,recurrence_frequency:row.recurrence_frequency,recurrence_interval:row.recurrence_interval,recurrence_end_mode:row.recurrence_end_mode,recurrence_end_date:row.recurrence_end_date,recurrence_count:row.recurrence_count,version:row.version,status:row.status,updated_at:row.updated_at,...(includePrivate?{resourceIds:resources(row.id)}:{})};}
function occurrenceExists(row:EventRow,occurrenceKey:string){const baseDate=row.timing_mode==="all_day"?row.start_date!:localParts(row.start_at!,row.time_zone).date;const baseTime=row.timing_mode==="timed"?localParts(row.start_at!,row.time_zone).time.slice(0,5):null;const maximum=row.recurrence_frequency?(row.recurrence_end_mode==="count"?row.recurrence_count!:1000):1;for(let index=0;index<maximum&&index<1000;index+=1){const occurrenceDate=index===0?baseDate:addCalendar(baseDate,row.recurrence_frequency!,index*row.recurrence_interval);if(!occurrenceDate)continue;if(row.recurrence_end_mode==="date"&&occurrenceDate>row.recurrence_end_date!)break;const expected=row.timing_mode==="all_day"?occurrenceDate:`${occurrenceDate}T${baseTime}`;if(expected===occurrenceKey)return true;if(expected>occurrenceKey)break;if(!row.recurrence_frequency)break;}return false;}

function normalizedInput(companyId:number,input:Record<string,unknown>){
  const company=db.prepare("SELECT time_zone FROM company WHERE id=?").get(companyId) as {time_zone:string}|undefined;
  if(!company)throw new EventDomainError("COMPANY_NOT_FOUND","Company not found.",404);
  const title=text(input.title,200);if(!title)throw new EventDomainError("VALIDATION_FAILED","Enter the Event Title.");
  const projectId=input.projectId===null||input.projectId===""||input.projectId===undefined?null:integer(input.projectId,1);
  if(input.projectId!==null&&input.projectId!==""&&input.projectId!==undefined&&!projectId)throw new EventDomainError("VALIDATION_FAILED","Choose a valid Project.");
  if(projectId&&!db.prepare("SELECT 1 FROM project WHERE id=? AND company_id=? AND status='active'").get(projectId,companyId))throw new EventDomainError("PROJECT_NOT_FOUND","Choose an active Project.",404);
  const timingMode=input.timingMode==="timed"?"timed":"all_day";
  let startDate:null|string=null,endDate:null|string=null,startAt:null|string=null,endAt:null|string=null;
  if(timingMode==="all_day"){
    startDate=date(input.startDate??input.start_date);endDate=date(input.endDate??input.end_date??input.startDate??input.start_date);
    if(!startDate||!endDate||endDate<startDate)throw new EventDomainError("VALIDATION_FAILED","Choose valid all-day Event dates.");
  }else{
    const localStartDate=date(input.startDate),localEndDate=date(input.endDate??input.startDate);const startTime=text(input.startTime,8),endTime=text(input.endTime,8);
    startAt=iso(input.startAt)??(localStartDate&&/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)?zonedInstant(localStartDate,startTime,company.time_zone):null);
    endAt=iso(input.endAt)??(localEndDate&&/^\d{2}:\d{2}(:\d{2})?$/.test(endTime)?zonedInstant(localEndDate,endTime,company.time_zone):null);
    if(!startAt||!endAt||endAt<=startAt)throw new EventDomainError("VALIDATION_FAILED","Timed Event end must be after its start.");
  }
  const frequency=["daily","weekly","monthly"].includes(String(input.recurrenceFrequency))?String(input.recurrenceFrequency) as Frequency:null;
  const recurrenceInterval=integer(input.recurrenceInterval??1,1,365)??1;
  let recurrenceEndMode: "date"|"count"|"none"="none",recurrenceEndDate:null|string=null,recurrenceCount:null|number=null;
  if(frequency){
    recurrenceEndMode=input.recurrenceEndMode==="date"?"date":input.recurrenceEndMode==="count"?"count":"none";
    if(recurrenceEndMode==="date"){recurrenceEndDate=date(input.recurrenceEndDate);if(!recurrenceEndDate||recurrenceEndDate<(startDate??localParts(startAt!,company.time_zone).date))throw new EventDomainError("VALIDATION_FAILED","Recurrence end date cannot be before the Event starts.");}
    if(recurrenceEndMode==="count"){recurrenceCount=integer(input.recurrenceCount,1,1000);if(!recurrenceCount)throw new EventDomainError("VALIDATION_FAILED","Occurrences must be a whole number from 1 to 1000.");}
  }
  const resourceIds=[...new Set((Array.isArray(input.resourceIds)?input.resourceIds:[]).map(value=>integer(value,1)).filter((value):value is number=>!!value))];
  if(resourceIds.length){const placeholders=resourceIds.map(()=>"?").join(",");const found=(db.prepare(`SELECT COUNT(*) count FROM resource WHERE company_id=? AND status='active' AND id IN (${placeholders})`).get(companyId,...resourceIds) as {count:number}).count;if(found!==resourceIds.length)throw new EventDomainError("RESOURCE_INVALID","Choose active Resources from this Company.");}
  return {projectId,title,description:text(input.description),color:color(input.color),timingMode,startDate,endDate,startAt,endAt,timeZone:company.time_zone,pushToProject:projectId&&input.pushToProject!==false?1:0,externalVisible:projectId&&(input.externalVisible===true||input.external_visible===true)?1:0,frequency,recurrenceInterval,recurrenceEndMode,recurrenceEndDate,recurrenceCount,resourceIds};
}

export function expandEventSeries(row:EventRow,rangeStart:string,rangeEnd:string,includePrivate=true):EventOccurrence[]{
  if(row.status!=="active")return [];
  const exceptions=new Map((db.prepare("SELECT occurrence_key,action,replacement_json FROM event_exception WHERE series_id=?").all(row.id) as Array<{occurrence_key:string;action:string;replacement_json:string|null}>).map(item=>[item.occurrence_key,item]));
  const resourceIds=resources(row.id);const project=db.prepare("SELECT name FROM project WHERE id=?").get(row.project_id) as {name:string}|undefined;
  const baseDate=row.timing_mode==="all_day"?row.start_date!:localParts(row.start_at!,row.time_zone).date;
  const baseTime=row.timing_mode==="timed"?localParts(row.start_at!,row.time_zone).time:null;
  const timedDuration=row.timing_mode==="timed"?Date.parse(row.end_at!)-Date.parse(row.start_at!):0;
  const dayDuration=row.timing_mode==="all_day"?Math.max(0,Math.round((Date.parse(`${row.end_date}T00:00:00Z`)-Date.parse(`${row.start_date}T00:00:00Z`))/86400000)):0;
  const output:EventOccurrence[]=[];const maximum=row.recurrence_frequency?(row.recurrence_end_mode==="count"?row.recurrence_count!:1000):1;
  for(let index=0;index<maximum&&index<1000;index+=1){
    const occurrenceDate=index===0?baseDate:addCalendar(baseDate,row.recurrence_frequency!,index*row.recurrence_interval);if(!occurrenceDate)continue;
    if(row.recurrence_end_mode==="date"&&occurrenceDate>row.recurrence_end_date!)break;if(occurrenceDate>rangeEnd)break;
    const occurrenceKey=row.timing_mode==="all_day"?occurrenceDate:`${occurrenceDate}T${baseTime!.slice(0,5)}`;const exception=exceptions.get(occurrenceKey);if(exception?.action==="cancel")continue;
    let start=row.timing_mode==="all_day"?occurrenceDate:zonedInstant(occurrenceDate,baseTime!,row.time_zone);
    let end=row.timing_mode==="all_day"?addDays(occurrenceDate,dayDuration+1):new Date(Date.parse(start)+timedDuration).toISOString();
    let title=row.title,description=row.description,colorValue=row.color;
    if(exception?.action==="replace"&&exception.replacement_json){const replacement=JSON.parse(exception.replacement_json) as Record<string,unknown>;title=text(replacement.title??title,200);description=text(replacement.description??description);colorValue=color(replacement.color??colorValue);if(row.timing_mode==="all_day"){const nextStart=date(replacement.startDate),nextEnd=date(replacement.endDate??replacement.startDate);if(nextStart&&nextEnd&&nextEnd>=nextStart){start=nextStart;end=addDays(nextEnd,1);}}else{const nextStart=iso(replacement.startAt),nextEnd=iso(replacement.endAt);if(nextStart&&nextEnd&&nextEnd>nextStart){start=nextStart;end=nextEnd;}}}
    if(end>rangeStart&&start<rangeEnd)output.push({id:`event:${row.id}:${occurrenceKey}`,seriesId:row.id,occurrenceKey,title,...(includePrivate?{description}:{}),color:colorValue,start,end,allDay:row.timing_mode==="all_day",projectId:row.project_id,projectName:project?.name??null,resourceIds,recurring:!!row.recurrence_frequency,version:row.version,externalVisible:!!row.external_visible,pushToProject:!!row.push_to_project,timeZone:row.time_zone});
    if(!row.recurrence_frequency)break;
  }
  return output;
}

export function listEventOccurrences(actor:Actor,options:{rangeStart:string;rangeEnd:string;projectId?:number|null;projectTypeIds?:number[];includeCompleted?:boolean;resourceId?:number|null}){
  if(actor.contextType!=="company"||!actor.companyId)throw new EventDomainError("ACTION_FORBIDDEN","Calendar access is unavailable.",403);
  const conditions=["es.company_id=?","es.status='active'"];const args:Array<number|string>=[actor.companyId];
  if(options.projectId){conditions.push("es.project_id=?");args.push(options.projectId);}
  if(options.projectTypeIds?.length){conditions.push(`(es.project_id IS NULL OR es.project_id IN (SELECT id FROM project WHERE project_type_id IN (${options.projectTypeIds.map(()=>"?").join(",")})))`);args.push(...options.projectTypeIds);}
  if(!options.includeCompleted)conditions.push("(es.project_id IS NULL OR p.status='active')");
  if(options.resourceId){conditions.push("EXISTS (SELECT 1 FROM event_resource er WHERE er.series_id=es.id AND er.resource_id=?)");args.push(options.resourceId);}
  if(actor.companyRole==="external"){conditions.push("es.project_id IS NOT NULL AND es.external_visible=1 AND es.push_to_project=1 AND EXISTS (SELECT 1 FROM project_membership pm WHERE pm.project_id=es.project_id AND pm.company_membership_id=?)");args.push(actor.membershipId!);}
  const rows=db.prepare(`SELECT es.* FROM event_series es LEFT JOIN project p ON p.id=es.project_id WHERE ${conditions.join(" AND ")} ORDER BY es.id`).all(...args) as EventRow[];
  return rows.flatMap(row=>expandEventSeries(row,options.rangeStart,options.rangeEnd,actor.companyRole!=="external"));
}

function saveResources(seriesId:number,resourceIds:number[]){db.prepare("DELETE FROM event_resource WHERE series_id=?").run(seriesId);const insert=db.prepare("INSERT INTO event_resource(series_id,resource_id) VALUES(?,?)");for(const resourceId of resourceIds)insert.run(seriesId,resourceId);}
function eventConflicts(companyId:number,seriesId:number){
  const row=db.prepare("SELECT * FROM event_series WHERE id=? AND company_id=?") .get(seriesId,companyId) as EventRow|undefined;if(!row)return [];
  const start=row.timing_mode==="all_day"?`${row.start_date}T00:00:00.000Z`:row.start_at!;const horizon=new Date(Date.parse(start)+366*86400000).toISOString();const occurrences=expandEventSeries(row,start,horizon);const output:Array<{occurrenceKey:string;resourceId:number;resourceName:string;withKind:"Task"|"Event";withTitle:string;start:string;end:string;timeZone:string}>=[];
  const resourceName=db.prepare("SELECT name FROM resource WHERE id=?");
  for(const occurrence of occurrences){for(const resourceId of occurrence.resourceIds){
    const tasks=db.prepare(`SELECT t.name,t.start_date,t.duration,t.allow_saturday,t.allow_sunday FROM task t JOIN task_resource tr ON tr.task_id=t.id JOIN project p ON p.id=t.project_id WHERE tr.resource_id=? AND p.company_id=? AND p.status='active' AND t.is_header=0`).all(resourceId,companyId) as Array<{name:string;start_date:string;duration:number;allow_saturday:number;allow_sunday:number}>;
    for(const task of tasks){const taskStart=`${task.start_date}T00:00:00.000Z`,taskEnd=`${addDays(workingDayEnd(task.start_date,task.duration,{allowSaturday:!!task.allow_saturday,allowSunday:!!task.allow_sunday}),1)}T00:00:00.000Z`;if(Date.parse(occurrence.end)>Date.parse(taskStart)&&Date.parse(occurrence.start)<Date.parse(taskEnd))output.push({occurrenceKey:occurrence.occurrenceKey,resourceId,resourceName:(resourceName.get(resourceId) as {name:string}).name,withKind:"Task",withTitle:task.name,start:occurrence.start,end:occurrence.end,timeZone:row.time_zone});}
    const others=db.prepare(`SELECT es.* FROM event_series es JOIN event_resource er ON er.series_id=es.id WHERE er.resource_id=? AND es.company_id=? AND es.status='active' AND es.id<>?`).all(resourceId,companyId,seriesId) as EventRow[];
    for(const other of others)for(const candidate of expandEventSeries(other,occurrence.start,occurrence.end))if(Date.parse(occurrence.end)>Date.parse(candidate.start)&&Date.parse(occurrence.start)<Date.parse(candidate.end))output.push({occurrenceKey:occurrence.occurrenceKey,resourceId,resourceName:(resourceName.get(resourceId) as {name:string}).name,withKind:"Event",withTitle:candidate.title,start:occurrence.start,end:occurrence.end,timeZone:row.time_zone});
  }}
  return output.slice(0,100);
}
function requireOrAcknowledgeConflicts(actor:Actor,seriesId:number,confirmed:boolean){const conflicts=eventConflicts(actor.companyId!,seriesId);if(conflicts.length&&!confirmed)throw new EventDomainError("RESOURCE_CONFLICT","One or more Resources are already scheduled. Review and confirm the overlap.",409,{conflicts});if(conflicts.length){const insert=db.prepare("INSERT INTO event_conflict_acknowledgement(series_id,occurrence_key,resource_id,actor_membership_id,conflict_summary_json) VALUES(?,?,?,?,?)");for(const conflict of conflicts)insert.run(seriesId,conflict.occurrenceKey,conflict.resourceId,actor.membershipId,JSON.stringify({withKind:conflict.withKind,withTitle:conflict.withTitle,start:conflict.start,end:conflict.end,timeZone:conflict.timeZone}));}return conflicts;}
export function createEventSeries(actor:Actor,input:Record<string,unknown>){
  if(actor.contextType!=="company"||!actor.companyId||!actor.membershipId||!["owner","admin"].includes(actor.companyRole??""))throw new EventDomainError("ACTION_FORBIDDEN","Only an Owner or Admin can add Events.",403);
  const value=normalizedInput(actor.companyId,input);
  return db.transaction(()=>{const result=db.prepare(`INSERT INTO event_series(company_id,project_id,title,description,color,timing_mode,start_date,end_date,start_at,end_at,time_zone,push_to_project,external_visible,recurrence_frequency,recurrence_interval,recurrence_end_mode,recurrence_end_date,recurrence_count,version,created_by_membership_id,updated_by_membership_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,CURRENT_TIMESTAMP)`).run(actor.companyId,value.projectId,value.title,value.description,value.color,value.timingMode,value.startDate,value.endDate,value.startAt,value.endAt,value.timeZone,value.pushToProject,value.externalVisible,value.frequency,value.recurrenceInterval,value.recurrenceEndMode,value.recurrenceEndDate,value.recurrenceCount,actor.membershipId,actor.membershipId);const id=Number(result.lastInsertRowid);saveResources(id,value.resourceIds);requireOrAcknowledgeConflicts(actor,id,input.confirmConflicts===true);return getEventSeries(actor,id)!;})();
}
export function getEventSeries(actor:Actor,id:number){if(actor.contextType!=="company"||!actor.companyId)return null;const row=eventRow(actor.companyId,id);if(!row)return null;if(actor.companyRole==="external"&&(!row.project_id||!row.external_visible||!row.push_to_project||!db.prepare("SELECT 1 FROM project_membership WHERE project_id=? AND company_membership_id=?").get(row.project_id,actor.membershipId)))return null;return eventDto(row,actor.companyRole!=="external");}
export function updateEventSeries(actor:Actor,id:number,input:Record<string,unknown>){
  if(actor.contextType!=="company"||!actor.companyId||!actor.membershipId||!["owner","admin"].includes(actor.companyRole??""))throw new EventDomainError("ACTION_FORBIDDEN","Only an Owner or Admin can edit Events.",403);const current=eventRow(actor.companyId,id);if(!current)throw new EventDomainError("EVENT_NOT_FOUND","Event not found.",404);if(integer(input.version,1)!==current.version)throw new EventDomainError("EVENT_VERSION_CONFLICT","This Event changed after you opened it. Refresh and try again.",409);const value=normalizedInput(actor.companyId,input);
  return db.transaction(()=>{const result=db.prepare(`UPDATE event_series SET project_id=?,title=?,description=?,color=?,timing_mode=?,start_date=?,end_date=?,start_at=?,end_at=?,time_zone=?,push_to_project=?,external_visible=?,recurrence_frequency=?,recurrence_interval=?,recurrence_end_mode=?,recurrence_end_date=?,recurrence_count=?,version=version+1,updated_by_membership_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND version=? AND status='active'`).run(value.projectId,value.title,value.description,value.color,value.timingMode,value.startDate,value.endDate,value.startAt,value.endAt,value.timeZone,value.pushToProject,value.externalVisible,value.frequency,value.recurrenceInterval,value.recurrenceEndMode,value.recurrenceEndDate,value.recurrenceCount,actor.membershipId,id,actor.companyId,current.version);if(result.changes!==1)throw new EventDomainError("EVENT_VERSION_CONFLICT","This Event changed after you opened it. Refresh and try again.",409);saveResources(id,value.resourceIds);requireOrAcknowledgeConflicts(actor,id,input.confirmConflicts===true);return getEventSeries(actor,id)!;})();
}
export function setEventException(actor:Actor,id:number,input:Record<string,unknown>){
  if(actor.contextType!=="company"||!actor.companyId||!actor.membershipId||!["owner","admin"].includes(actor.companyRole??""))throw new EventDomainError("ACTION_FORBIDDEN","Only an Owner or Admin can edit Event occurrences.",403);const current=eventRow(actor.companyId,id);if(!current)throw new EventDomainError("EVENT_NOT_FOUND","Event not found.",404);if(integer(input.version,1)!==current.version)throw new EventDomainError("EVENT_VERSION_CONFLICT","This Event changed after you opened it. Refresh and try again.",409);const occurrenceKey=text(input.occurrenceKey,40);if(!occurrenceKey||!occurrenceExists(current,occurrenceKey))throw new EventDomainError("VALIDATION_FAILED","Choose a valid Event occurrence.");const action=input.action==="cancel"?"cancel":"replace";const replacement=action==="replace"?JSON.stringify(input.replacement??{}):null;
  return db.transaction(()=>{db.prepare(`INSERT INTO event_exception(series_id,occurrence_key,action,replacement_json,version,updated_at,updated_by_membership_id) VALUES(?,?,?,?,1,CURRENT_TIMESTAMP,?) ON CONFLICT(series_id,occurrence_key) DO UPDATE SET action=excluded.action,replacement_json=excluded.replacement_json,version=event_exception.version+1,updated_at=CURRENT_TIMESTAMP,updated_by_membership_id=excluded.updated_by_membership_id`).run(id,occurrenceKey,action,replacement,actor.membershipId);const result=db.prepare("UPDATE event_series SET version=version+1,updated_by_membership_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND version=?").run(actor.membershipId,id,actor.companyId,current.version);if(result.changes!==1)throw new EventDomainError("EVENT_VERSION_CONFLICT","This Event changed after you opened it. Refresh and try again.",409);if(action==="replace")requireOrAcknowledgeConflicts(actor,id,input.confirmConflicts===true);return getEventSeries(actor,id)!;})();
}
export function deleteEventSeries(actor:Actor,id:number,version:number){
  if(actor.contextType!=="company"||!actor.companyId||!actor.membershipId||!["owner","admin"].includes(actor.companyRole??""))throw new EventDomainError("ACTION_FORBIDDEN","Only an Owner or Admin can delete Events.",403);const result=db.prepare("UPDATE event_series SET status='deleted',deleted_at=CURRENT_TIMESTAMP,version=version+1,updated_by_membership_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND version=? AND status='active'").run(actor.membershipId,id,actor.companyId,version);if(result.changes!==1)throw new EventDomainError("EVENT_VERSION_CONFLICT","This Event changed after you opened it. Refresh and try again.",409);return {id,status:"deleted"};
}
