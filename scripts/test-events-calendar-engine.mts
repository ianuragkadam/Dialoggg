import assert from "node:assert/strict";
import db from "../src/db/index.ts";
import type { Actor } from "../src/lib/auth.ts";
import { createEventSeries, deleteEventSeries, EventDomainError, listEventOccurrences, setEventException, updateEventSeries } from "../src/lib/events-calendar.ts";

const companyId=Number(db.prepare("INSERT INTO company(name,time_zone) VALUES('Calendar Engine','America/New_York')").run().lastInsertRowid);
const identityId=Number(db.prepare("INSERT INTO identity(normalized_email,password_hash,first_name,status) VALUES('calendar-engine@example.test','hash','Calendar','active')").run().lastInsertRowid);
const membershipId=Number(db.prepare("INSERT INTO company_membership(identity_id,company_id,role,status,accepted_at) VALUES(?,?,'admin','active',CURRENT_TIMESTAMP)").run(identityId,companyId).lastInsertRowid);
for(const name of ["Employee","Subcontractor","Supplier","Equipment","Other"])db.prepare("INSERT INTO resource_category(company_id,name) VALUES(?,?)").run(companyId,name);
const typeId=Number(db.prepare("INSERT INTO project_type(company_id,name,normalized_name) VALUES(?,'Court','court')").run(companyId).lastInsertRowid);
const projectId=Number(db.prepare("INSERT INTO project(company_id,project_type_id,name,start_date) VALUES(?,?,'Calendar Project','2026-09-01')").run(companyId,typeId).lastInsertRowid);
const actor:Actor={sessionId:1,identityId,legacyUserId:null,membershipId,email:"calendar-engine@example.test",firstName:"Calendar",lastName:"Admin",contextType:"company",companyId,companyName:"Calendar Engine",companyTimeZone:"America/New_York",companyRole:"admin",isPlatformAdmin:false,csrfHash:"hash",expiresAt:"2099-01-01T00:00:00Z"};

let series=createEventSeries(actor,{projectId,pushToProject:true,title:"Daily inspection",timingMode:"all_day",startDate:"2026-09-20",endDate:"2026-09-20",recurrenceFrequency:"daily",recurrenceEndMode:"count",recurrenceCount:3,resourceIds:[]}) as any;
let items=listEventOccurrences(actor,{rangeStart:"2026-09-19T00:00:00Z",rangeEnd:"2026-09-25T00:00:00Z",projectId,includeArchived:true});
assert.deepEqual(items.map(item=>item.start),["2026-09-20","2026-09-21","2026-09-22"]);
series=setEventException(actor,series.id,{version:series.version,occurrenceKey:"2026-09-21",action:"cancel"}) as any;
items=listEventOccurrences(actor,{rangeStart:"2026-09-19T00:00:00Z",rangeEnd:"2026-09-25T00:00:00Z",projectId,includeArchived:true});
assert.deepEqual(items.map(item=>item.start),["2026-09-20","2026-09-22"]);
assert.throws(()=>updateEventSeries(actor,series.id,{version:1,projectId,title:"Stale",timingMode:"all_day",startDate:"2026-09-20",endDate:"2026-09-20",resourceIds:[]}),(error:unknown)=>error instanceof EventDomainError&&error.code==="EVENT_VERSION_CONFLICT");

const timed=createEventSeries(actor,{projectId,pushToProject:true,title:"DST weekly",timingMode:"timed",startDate:"2026-10-27",endDate:"2026-10-27",startTime:"14:00",endTime:"15:00",recurrenceFrequency:"weekly",recurrenceEndMode:"count",recurrenceCount:2,resourceIds:[]}) as any;
items=listEventOccurrences(actor,{rangeStart:"2026-10-26T00:00:00Z",rangeEnd:"2026-11-05T00:00:00Z",projectId,includeArchived:true});
assert.deepEqual(items.filter(item=>item.seriesId===timed.id).map(item=>item.start),["2026-10-27T18:00:00.000Z","2026-11-03T19:00:00.000Z"]);

const categoryId=(db.prepare("SELECT id FROM resource_category WHERE company_id=? AND name='Employee'").get(companyId) as {id:number}).id;
const resourceId=Number(db.prepare("INSERT INTO resource(company_id,category_id,name,normalized_name,status) VALUES(?,?,'Crew Alpha','crew alpha','active')").run(companyId,categoryId).lastInsertRowid);
const root=(db.prepare("SELECT id FROM task WHERE project_id=? AND is_root=1").get(projectId) as {id:number}).id;
const taskId=Number(db.prepare("INSERT INTO task(project_id,parent_id,name,start_date,manual_start_date,duration,is_header,is_root) VALUES(?,?,'Court work','2026-09-25','2026-09-25',1,0,0)").run(projectId,root).lastInsertRowid);db.prepare("INSERT INTO task_resource(task_id,resource_id) VALUES(?,?)").run(taskId,resourceId);
assert.throws(()=>createEventSeries(actor,{projectId,pushToProject:true,title:"Conflict",timingMode:"timed",startDate:"2026-09-25",endDate:"2026-09-25",startTime:"10:00",endTime:"11:00",resourceIds:[resourceId]}),(error:unknown)=>error instanceof EventDomainError&&error.code==="RESOURCE_CONFLICT"&&Array.isArray(error.details?.conflicts));
const confirmed=createEventSeries(actor,{projectId,pushToProject:true,title:"Confirmed conflict",timingMode:"timed",startDate:"2026-09-25",endDate:"2026-09-25",startTime:"10:00",endTime:"11:00",resourceIds:[resourceId],confirmConflicts:true}) as any;
assert.equal((db.prepare("SELECT COUNT(*) count FROM event_conflict_acknowledgement WHERE series_id=?").get(confirmed.id) as {count:number}).count,1);
deleteEventSeries(actor,series.id,series.version);assert.equal(listEventOccurrences(actor,{rangeStart:"2026-09-19T00:00:00Z",rangeEnd:"2026-09-25T00:00:00Z",projectId,includeArchived:true}).some(item=>item.seriesId===series.id),false);
assert.equal(db.pragma("foreign_key_check").length,0);
process.stdout.write("Event recurrence, DST, exception, conflict, history, and concurrency checks passed.\n");
