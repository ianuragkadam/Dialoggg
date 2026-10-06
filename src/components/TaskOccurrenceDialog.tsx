"use client";

import Link from "next/link";

type Project = { id: number; name: string; project_type_id?: number; project_type?: string };

export default function TaskOccurrenceDialog({ event, projects, timeZone, canManage, onClose }: { event: any; projects: Project[]; timeZone: string; canManage: boolean; onClose: () => void }) {
  const props = event.extendedProps || {};
  const project = projects.find(item => item.id === Number(props.project_id));
  const start = event.start;
  const end = event.end;
  const formatDate = (date: Date) => new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(date);
  const schedule = start ? `${formatDate(start)}${end && formatDate(new Date(end.getTime() - 86400000)) !== formatDate(start) ? `–${formatDate(new Date(end.getTime() - 86400000))}` : ""} · All day` : "Schedule unavailable";
  const projectSuffix = project ? ` (${project.name})` : "";
  const taskTitle = props.rawTitle || (projectSuffix && event.title.endsWith(projectSuffix) ? event.title.slice(0, -projectSuffix.length) : event.title);
  const planHref = canManage && project && props.taskId ? `/projects/${project.id}?editTaskId=${encodeURIComponent(props.taskId)}#plan` : null;

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-3" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-label="Task details" className="w-full max-w-lg rounded-xl bg-white shadow-2xl" onMouseDown={item => item.stopPropagation()}><header className="flex items-center justify-between rounded-t-xl border-b bg-blue-900 px-5 py-4 text-white"><h2 className="text-lg font-bold">Task details</h2><button type="button" aria-label="Close Task details" onClick={onClose} className="rounded px-2 text-2xl hover:bg-white/15">×</button></header><div className="space-y-3 p-5 text-sm"><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-900">Task · Project Plan source</span><h3 className="text-lg font-bold">{taskTitle}</h3><dl className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-slate-500">Project</dt><dd>{project?.name || "Project unavailable"}</dd><dt className="text-slate-500">Schedule</dt><dd>{schedule}</dd></dl><p className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-950">{canManage ? "Task dates and dependencies are managed in the original Project Plan. Open the Task there to make changes." : "Task dates and dependencies are managed in the Project Plan by an Admin or Owner."}</p></div><footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded border px-4 py-2 text-sm font-bold">Close</button>{planHref && <Link href={planHref} onClick={onClose} className="rounded bg-blue-700 px-4 py-2 text-center text-sm font-bold text-white">Edit in Project Plan</Link>}</footer></section></div>;
}
