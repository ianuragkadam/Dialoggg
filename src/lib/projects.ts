import db from "@/db";
import { addDays, addWorkingDays, parseISO } from "@/lib/dates";
import { instantiateProjectTemplate, validateIdempotencyKey } from "@/lib/project-templates";
import { activeProjectTypeId } from "@/lib/project-types";
import { recalculateProjectPlan } from "@/lib/gantt-cascade";
import type { Actor } from "@/lib/auth";
import type { ProjectUiRecord, ProjectUserOptionUi } from "@/lib/projects-ui";

export class ProjectValidationError extends Error { constructor(public fields: Record<string, string>) { super("PROJECT_VALIDATION_FAILED"); } }

function validDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(`${value}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value; }
export function validateProjectInput(input: Record<string, unknown>, companyId: number) {
  const fields: Record<string, string> = {};
  const required: Array<[string, string]> = [["name","Project Name"],["clientName","Client Name"],["clientEmail","Client Email"],["address","Address"],["city","City"],["state","State"],["zip","Zip"],["phone","Phone Number"]];
  for (const [key, label] of required) if (!String(input[key] ?? "").trim()) fields[key] = `Enter the ${label}.`;
  if (String(input.name ?? "").trim().length > 100) fields.name = "Use 100 characters or fewer.";
  if (String(input.clientEmail ?? "").trim() && !/^\S+@\S+\.\S+$/.test(String(input.clientEmail).trim())) fields.clientEmail = "Enter a valid Client Email.";
  if (!validDate(String(input.startDate ?? ""))) fields.startDate = "Choose a valid Project Start Date.";
  if (!activeProjectTypeId(input.projectTypeId, companyId)) fields.projectTypeId = "Choose a valid company Project Type.";
  return fields;
}

export function listProjectUsers(companyId: number, projectId?: number): ProjectUserOptionUi[] {
  return db.prepare(`SELECT cm.id, cm.role, i.first_name, i.last_name, i.normalized_email,
    CASE WHEN pm.project_id IS NULL THEN 0 ELSE 1 END assigned
    FROM company_membership cm JOIN identity i ON i.id=cm.identity_id
    LEFT JOIN project_membership pm ON pm.company_membership_id=cm.id AND pm.project_id=?
    WHERE cm.company_id=? AND cm.status='active' ORDER BY lower(i.first_name), lower(i.last_name), cm.id`)
    .all(projectId ?? -1, companyId).map((row: any) => ({ id:Number(row.id), name:`${row.first_name} ${row.last_name}`.trim(), email:String(row.normalized_email), role:row.role, assigned:!!row.assigned }));
}

export function getProjectRecord(projectId: number, companyId: number): ProjectUiRecord | null {
  const row = db.prepare(`SELECT p.*, pt.name project_type,
    SUM(CASE WHEN t.is_header=0 THEN 1 ELSE 0 END) task_count,
    SUM(CASE WHEN t.is_header=0 AND t.progress>=1 THEN 1 ELSE 0 END) completed_task_count,
    p.end_date derived_end_date
    FROM project p JOIN project_type pt ON pt.id=p.project_type_id AND pt.company_id=p.company_id
    LEFT JOIN task t ON t.project_id=p.id WHERE p.id=? AND p.company_id=? GROUP BY p.id`).get(projectId, companyId) as ProjectUiRecord | undefined;
  if (!row) return null;
  row.assignments = listProjectUsers(companyId, projectId).filter(user => user.assigned);
  return row;
}

function validateAssignments(companyId: number, ids: number[]) {
  const unique=[...new Set(ids)];
  if (!unique.every(id=>Number.isInteger(id)&&id>0)) throw new ProjectValidationError({ assignments:"Choose active Users from this company." });
  if (unique.length) { const q=unique.map(()=>"?").join(","); const found=db.prepare(`SELECT COUNT(1) count FROM company_membership WHERE company_id=? AND status='active' AND id IN (${q})`).get(companyId,...unique) as {count:number}; if(found.count!==unique.length) throw new ProjectValidationError({assignments:"Choose active Users from this company."}); }
  return unique;
}
function setAssignments(projectId:number, companyId:number, ids:number[], actorMembershipId:number) {
  const wanted=new Set(validateAssignments(companyId,[...ids,actorMembershipId]));
  const current=new Set((db.prepare("SELECT company_membership_id id FROM project_membership WHERE project_id=?").all(projectId) as Array<{id:number}>).map(x=>x.id));
  const del=db.prepare("DELETE FROM project_membership WHERE project_id=? AND company_membership_id=?");
  const add=db.prepare("INSERT OR IGNORE INTO project_membership(project_id,company_membership_id) VALUES(?,?)");
  for(const id of current) if(!wanted.has(id)) del.run(projectId,id);
  for(const id of wanted) if(!current.has(id)) add.run(projectId,id);
}

function businessDelta(from:string,to:string){ if(from===to)return 0; const direction=to>from?1:-1; let value=from,count=0; while(value!==to){value=addDays(value,direction); const day=parseISO(value).getDay(); if(day!==0&&day!==6)count+=direction;} return count; }
function shiftUnfinishedTasks(projectId:number, oldDate:string, newDate:string){ const delta=businessDelta(oldDate,newDate); if(!delta)return; const rows=db.prepare("SELECT id,start_date,allow_saturday,allow_sunday FROM task WHERE project_id=? AND is_header=0 AND progress<1 ORDER BY id").all(projectId) as Array<any>; const update=db.prepare("UPDATE task SET start_date=?,manual_start_date=? WHERE id=? AND project_id=?"); for(const row of rows) { const shifted=addWorkingDays(row.start_date,delta,{allowSaturday:!!row.allow_saturday,allowSunday:!!row.allow_sunday}); update.run(shifted,shifted,row.id,projectId); } }

export function createProjectRecord(actor:Actor,input:Record<string,unknown>){ const fields=validateProjectInput(input,actor.companyId!); const templateId=Number(input.templateId); const idempotencyKey=Number.isInteger(templateId)&&templateId>0?validateIdempotencyKey(input.idempotencyKey):null; if(Number.isInteger(templateId)&&templateId>0&&!idempotencyKey)fields.idempotencyKey="Refresh and try again."; if(Object.keys(fields).length)throw new ProjectValidationError(fields); const assignments=Array.isArray(input.assignmentIds)?input.assignmentIds.map(Number):[]; const typeId=activeProjectTypeId(input.projectTypeId,actor.companyId!)!; return db.transaction(()=>{ let id:number; if(Number.isInteger(templateId)&&templateId>0){ const result=instantiateProjectTemplate({companyId:actor.companyId!,membershipId:actor.membershipId!,legacyUserId:actor.legacyUserId,templateId,projectTypeId:typeId,projectName:String(input.name).trim(),startDate:String(input.startDate),clientName:String(input.clientName).trim(),idempotencyKey:idempotencyKey!}); id=result.projectId; db.prepare(`UPDATE project SET client_email=?,address=?,city=?,state=?,zip=?,phone=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(String(input.clientEmail).trim().toLowerCase(),String(input.address).trim(),String(input.city).trim(),String(input.state).trim(),String(input.zip).trim(),String(input.phone).trim(),String(input.note??"").trim()||null,id); } else { const result=db.prepare(`INSERT INTO project(company_id,project_type_id,name,client_name,client_email,address,city,state,zip,phone,start_date,note,created_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(actor.companyId,typeId,String(input.name).trim(),String(input.clientName).trim(),String(input.clientEmail).trim().toLowerCase(),String(input.address).trim(),String(input.city).trim(),String(input.state).trim(),String(input.zip).trim(),String(input.phone).trim(),String(input.startDate),String(input.note??"").trim()||null,actor.legacyUserId); id=Number(result.lastInsertRowid); recalculateProjectPlan(id); }
    setAssignments(id,actor.companyId!,assignments,actor.membershipId!); return getProjectRecord(id,actor.companyId!)!; })(); }

export function updateProjectRecord(actor:Actor,projectId:number,input:Record<string,unknown>){ const fields=validateProjectInput(input,actor.companyId!); if(Object.keys(fields).length)throw new ProjectValidationError(fields); const current=getProjectRecord(projectId,actor.companyId!); if(!current)return null; if(current.status!=="active")throw new Error("PROJECT_READ_ONLY"); const version=Number(input.version); if(!Number.isInteger(version)||version!==current.version)throw new Error("PROJECT_VERSION_CONFLICT"); const mode=input.rebaseMode==="shift-unfinished"?"shift-unfinished":"date-only"; const assignments=Array.isArray(input.assignmentIds)?input.assignmentIds.map(Number):[]; return db.transaction(()=>{ const planChanged=current.start_date!==input.startDate||current.name!==String(input.name).trim(); if(current.start_date!==input.startDate&&mode==="shift-unfinished")shiftUnfinishedTasks(projectId,current.start_date,String(input.startDate)); const typeId=activeProjectTypeId(input.projectTypeId,actor.companyId!)!; const result=db.prepare(`UPDATE project SET project_type_id=?,name=?,client_name=?,client_email=?,address=?,city=?,state=?,zip=?,phone=?,start_date=?,note=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND version=? AND status='active'`).run(typeId,String(input.name).trim(),String(input.clientName).trim(),String(input.clientEmail).trim().toLowerCase(),String(input.address).trim(),String(input.city).trim(),String(input.state).trim(),String(input.zip).trim(),String(input.phone).trim(),String(input.startDate),String(input.note??"").trim()||null,projectId,actor.companyId,version); if(result.changes!==1)throw new Error("PROJECT_VERSION_CONFLICT"); db.prepare("UPDATE task SET name=? WHERE project_id=? AND is_root=1").run(String(input.name).trim(),projectId); recalculateProjectPlan(projectId,planChanged); setAssignments(projectId,actor.companyId!,assignments,actor.membershipId!); return getProjectRecord(projectId,actor.companyId!)!; })(); }

export function changeProjectLifecycle(projectId:number,companyId:number,action:"complete"|"reopen"|"archive"|"restore",version:number){ const current=getProjectRecord(projectId,companyId); if(!current)return null; const map={complete:["active","completed"],reopen:["completed","active"],archive:[current.status==="active"||current.status==="completed"?current.status:"invalid","archived"],restore:["archived","active"]} as const; const [expected,next]=map[action]; if(current.status!==expected||!Number.isInteger(version)||current.version!==version)throw new Error("PROJECT_LIFECYCLE_CONFLICT"); const result=db.prepare(`UPDATE project SET status=?,completed_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP WHEN ?='active' THEN NULL ELSE completed_at END,archived_at=CASE WHEN ?='archived' THEN CURRENT_TIMESTAMP WHEN ?='active' THEN NULL ELSE archived_at END,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND version=?`).run(next,next,next,next,next,projectId,companyId,version); return result.changes===1?getProjectRecord(projectId,companyId):null; }

export function permanentlyDeleteProject(projectId:number,companyId:number,name:string){ const result=db.prepare("DELETE FROM project WHERE id=? AND company_id=? AND status='archived' AND name=?").run(projectId,companyId,name); return result.changes===1; }
