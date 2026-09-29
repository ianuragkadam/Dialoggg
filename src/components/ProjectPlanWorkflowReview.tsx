"use client";

import { useEffect, useMemo, useState } from "react";

type DialogName = "task" | "schedule-review" | "delete-leaf" | "delete-header" | "root" | null;
type TaskKind = "leaf" | "header";
type StartMethod = "period" | "link";
type DependencyType = "Finish-to-Start" | "Start-to-Start" | "Finish-to-Finish" | "Start-to-Finish";

type Predecessor = {
  id: number;
  task: string;
  type: DependencyType;
  lag: string;
};

const TASKS = ["Site preparation", "Concrete base", "Fence installation", "Acrylic surfacing"];
const DEPENDENCY_TYPES: DependencyType[] = ["Finish-to-Start", "Start-to-Start", "Finish-to-Finish", "Start-to-Finish"];

function addWorkingDays(start: string, duration: number, saturday: boolean, sunday: boolean) {
  if (!start || duration < 1) return "—";
  const date = new Date(`${start}T12:00:00`);
  let counted = 0;
  while (counted < duration) {
    const day = date.getDay();
    if ((day !== 6 || saturday) && (day !== 0 || sunday)) counted += 1;
    if (counted < duration) date.setDate(date.getDate() + 1);
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Modal({ title, role = "dialog", children, onClose, wide = false }: {
  title: string;
  role?: "dialog" | "alertdialog";
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" onMouseDown={onClose}>
      <section
        role={role}
        aria-modal="true"
        aria-label={title}
        className={`max-h-[94vh] w-full overflow-y-auto rounded-xl bg-white shadow-2xl ${wide ? "max-w-4xl" : "max-w-lg"}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-xl border-b bg-blue-900 px-5 py-4 text-white">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" aria-label={`Close ${title}`} className="rounded px-2 py-1 text-2xl leading-none hover:bg-white/15" onClick={onClose}>×</button>
        </header>
        {children}
      </section>
    </div>
  );
}

export default function ProjectPlanWorkflowReview({ projectName, canEdit }: { projectName: string; canEdit: boolean }) {
  const [dialog, setDialog] = useState<DialogName>(null);
  const [taskKind, setTaskKind] = useState<TaskKind>("leaf");
  const [startMethod, setStartMethod] = useState<StartMethod>("period");
  const [taskName, setTaskName] = useState("Court surfacing");
  const [parent, setParent] = useState("Construction");
  const [startDate, setStartDate] = useState("2026-09-21");
  const [duration, setDuration] = useState("5");
  const [saturday, setSaturday] = useState(false);
  const [sunday, setSunday] = useState(false);
  const [category, setCategory] = useState("Installation Crew");
  const [resources, setResources] = useState(["Crew Alpha"]);
  const [color, setColor] = useState("#2e75b6");
  const [progress, setProgress] = useState(25);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [predecessors, setPredecessors] = useState<Predecessor[]>([
    { id: 1, task: "Concrete base", type: "Finish-to-Start", lag: "0" },
  ]);

  const endDate = useMemo(
    () => addWorkingDays(startDate, Number(duration), saturday, sunday),
    [startDate, duration, saturday, sunday],
  );

  function openTask(kind: TaskKind = "leaf") {
    setTaskKind(kind);
    setTaskName(kind === "header" ? "Construction" : "Court surfacing");
    setParent(kind === "header" ? `${projectName} (root)` : "Construction");
    setErrors([]);
    setDialog("task");
  }

  function toggleResource(name: string) {
    setResources((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  }

  function updatePredecessor(id: number, field: keyof Omit<Predecessor, "id">, value: string) {
    setPredecessors((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }

  function addPredecessor() {
    setPredecessors((current) => [...current, {
      id: Math.max(0, ...current.map((item) => item.id)) + 1,
      task: "Fence installation",
      type: "Start-to-Start",
      lag: "1",
    }]);
  }

  function reviewTask() {
    const nextErrors: string[] = [];
    if (!taskName.trim()) nextErrors.push("Enter the Task Name.");
    if (taskKind === "leaf" && (!Number.isInteger(Number(duration)) || Number(duration) < 1)) nextErrors.push("Duration must be a whole number of at least 1 working day.");
    if (taskKind === "leaf" && startMethod === "period" && !startDate) nextErrors.push("Choose a Start Date for a Time Period Task.");
    if (taskKind === "leaf" && startMethod === "link" && predecessors.length === 0) nextErrors.push("Add at least one predecessor for a linked Task.");
    if (taskKind === "leaf" && startMethod === "link" && predecessors.some((item) => !Number.isInteger(Number(item.lag)) || Number(item.lag) < 0)) nextErrors.push("Every dependency lag must be zero or a positive whole number.");
    setErrors(nextErrors);
    if (!nextErrors.length) setDialog("schedule-review");
  }

  function completePreview() {
    setDialog(null);
    setNotice("Task workflow preview complete. The original Project Plan and production data were not changed.");
  }

  return (
    <section className="overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm" data-original-gantt-boundary="preserved">
        {!canEdit && <div className="flex justify-end border-b px-4 py-2"><span className="rounded-md border border-blue-300 bg-blue-800/70 px-3 py-2 text-sm font-semibold text-white">Read-only Project Plan</span></div>}
        {notice && <div role="status" className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{notice}</div>}

        <div className="grid gap-3 p-4">
          <div className="rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Immutable root Header Task</p>
                <p className="font-semibold text-slate-900">{projectName}</p>
              </div>
              {canEdit && <button type="button" onClick={() => setDialog("root")} className="rounded border px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white">Review root rules</button>}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-3 py-3 text-sm">
              <div className="pl-3 font-medium text-slate-800">▾ Site preparation</div><div className="text-slate-500">Header · derived</div>
              <div className="pl-7 text-slate-700">Site survey</div><div className="text-slate-500">2 workdays · 100%</div>
              <div className="pl-7 text-slate-700">Excavation</div><div className="text-slate-500">3 workdays · 60%</div>
              <div className="pl-3 font-medium text-slate-800">▾ Construction</div><div className="text-slate-500">Header · derived</div>
              <div className="pl-7 text-slate-700">Concrete base → Court surfacing</div><div className="text-slate-500">FS +0 · linked</div>
            </div>
            {canEdit && <div className="flex flex-wrap gap-2 border-t px-3 py-2">
              <button type="button" onClick={() => openTask("header")} className="rounded border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50">Review Header editor</button>
              <button type="button" onClick={() => setDialog("delete-header")} className="rounded border px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Header deletion block</button>
              <button type="button" onClick={() => setDialog("delete-leaf")} className="rounded border px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Leaf deletion confirmation</button>
            </div>}
          </div>

        </div>

      {dialog === "task" && (
        <Modal title={taskKind === "header" ? "Review Header Task" : "Add Task"} onClose={() => setDialog(null)} wide>
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_280px]">
            <div className="space-y-5">
              {errors.length > 0 && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">Please fix the following:</p><ul className="mt-1 list-disc pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
              <fieldset>
                <legend className="text-sm font-semibold text-slate-800">Task type</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(["leaf", "header"] as TaskKind[]).map((kind) => <label key={kind} className={`cursor-pointer rounded-lg border p-3 ${taskKind === kind ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}><input type="radio" name="task-kind" checked={taskKind === kind} onChange={() => { setTaskKind(kind); setParent(kind === "header" ? `${projectName} (root)` : "Construction"); setErrors([]); }} className="mr-2"/><span className="font-semibold">{kind === "leaf" ? "Leaf Task" : "Header Task"}</span><span className="mt-1 block pl-5 text-xs text-slate-600">{kind === "leaf" ? "Scheduled work that can use Resources and dependencies." : "Groups children; dates and progress are calculated."}</span></label>)}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">Task Name <span className="text-red-600">*</span><input id="task-name" value={taskName} onChange={(event) => setTaskName(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 font-normal"/></label>
                <label className="text-sm font-medium text-slate-700">Parent Header<select id="task-parent" value={parent} onChange={(event) => setParent(event.target.value)} className="mt-1 w-full rounded-md border bg-white px-3 py-2 font-normal"><option>{projectName} (root)</option><option>Site preparation</option><option>Construction</option></select></label>
              </div>

              {taskKind === "header" ? (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
                  <h3 className="font-semibold">Header values are derived</h3>
                  <p className="mt-1">Start is the earliest descendant Start Date; End is the latest descendant End Date. Progress is weighted by descendant leaf Task duration.</p>
                  <p className="mt-2 font-medium">Resources, dependencies, weekend rules, and direct progress are unavailable for Header Tasks.</p>
                </div>
              ) : (
                <>
                  <fieldset>
                    <legend className="text-sm font-semibold text-slate-800">Start method</legend>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm"><label><input type="radio" name="start-method" checked={startMethod === "period"} onChange={() => setStartMethod("period")} className="mr-2"/>Time Period</label><label><input type="radio" name="start-method" checked={startMethod === "link"} onChange={() => setStartMethod("link")} className="mr-2"/>Link to predecessor</label></div>
                  </fieldset>
                  {startMethod === "period" ? (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="text-sm font-medium text-slate-700">Start Date <span className="text-red-600">*</span><input id="task-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 font-normal"/></label>
                      <label className="text-sm font-medium text-slate-700">Duration (working days) <span className="text-red-600">*</span><input id="task-duration" type="number" min="1" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 font-normal"/></label>
                      <div className="rounded-md bg-slate-100 p-3 text-sm"><span className="block text-xs font-bold uppercase text-slate-500">Inclusive End Date</span><strong>{endDate}</strong></div>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Predecessors</h3><p className="text-xs text-slate-500">The latest calculated constraint controls the Task.</p></div><button type="button" onClick={addPredecessor} className="rounded border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-800">+ Add predecessor</button></div>
                      {predecessors.map((item, index) => <div key={item.id} className="grid gap-2 rounded border bg-white p-2 sm:grid-cols-[1fr_1fr_90px_auto]">
                        <label className="text-xs font-medium">Predecessor {index + 1}<select aria-label={`Predecessor ${index + 1} Task`} value={item.task} onChange={(event) => updatePredecessor(item.id, "task", event.target.value)} className="mt-1 w-full rounded border bg-white px-2 py-2 text-sm font-normal">{TASKS.map((task) => <option key={task}>{task}</option>)}</select></label>
                        <label className="text-xs font-medium">Dependency type<select aria-label={`Predecessor ${index + 1} dependency type`} value={item.type} onChange={(event) => updatePredecessor(item.id, "type", event.target.value)} className="mt-1 w-full rounded border bg-white px-2 py-2 text-sm font-normal">{DEPENDENCY_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
                        <label className="text-xs font-medium">Lag<input aria-label={`Predecessor ${index + 1} lag`} type="number" min="0" step="1" value={item.lag} onChange={(event) => updatePredecessor(item.id, "lag", event.target.value)} className="mt-1 w-full rounded border px-2 py-2 text-sm font-normal"/></label>
                        <button type="button" aria-label={`Remove predecessor ${index + 1}`} onClick={() => setPredecessors((current) => current.filter((row) => row.id !== item.id))} className="self-end rounded px-2 py-2 text-sm text-red-700 hover:bg-red-50">Remove</button>
                      </div>)}
                      <label className="block max-w-xs text-sm font-medium text-slate-700">Duration (working days) <span className="text-red-600">*</span><input type="number" min="1" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-1 w-full rounded-md border bg-white px-3 py-2 font-normal"/></label>
                    </div>
                  )}
                  <fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">Working days for this Task</legend><div className="flex flex-wrap gap-5 text-sm"><label><input type="checkbox" checked={saturday} onChange={(event) => setSaturday(event.target.checked)} className="mr-2"/>Allow work on Saturday</label><label><input type="checkbox" checked={sunday} onChange={(event) => setSunday(event.target.checked)} className="mr-2"/>Allow work on Sunday</label></div><p className="mt-2 text-xs text-slate-500">These independent rules also determine how this Task counts dependency lag.</p></fieldset>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">Resource Category<select value={category} onChange={(event) => { setCategory(event.target.value); setResources([]); }} className="mt-1 w-full rounded-md border bg-white px-3 py-2 font-normal"><option>Installation Crew</option><option>Equipment</option><option>Subcontractor</option></select></label>
                    <fieldset><legend className="text-sm font-medium text-slate-700">Resources</legend><div className="mt-1 space-y-1 rounded-md border p-2 text-sm">{(category === "Installation Crew" ? ["Crew Alpha", "Crew Bravo"] : category === "Equipment" ? ["Laser grader", "Concrete mixer"] : ["Court Electric LLC", "FenceWorks PA"]).map((name) => <label key={name} className="block"><input type="checkbox" checked={resources.includes(name)} onChange={() => toggleResource(name)} className="mr-2"/>{name}</label>)}</div></fieldset>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <fieldset><legend className="text-sm font-medium text-slate-700">Task Color</legend><div className="mt-2 flex gap-2">{["#2e75b6", "#2f855a", "#d97706", "#9333ea", "#dc2626"].map((value) => <button type="button" key={value} aria-label={`Select Task Color ${value}`} aria-pressed={color === value} onClick={() => setColor(value)} className={`h-8 w-8 rounded-full border-2 ${color === value ? "border-slate-900 ring-2 ring-slate-300" : "border-white"}`} style={{ backgroundColor: value }}/>)}</div></fieldset>
                    <label className="text-sm font-medium text-slate-700">Progress: {progress}%<input aria-label="Task Progress" type="range" min="0" max="100" step="5" value={progress} onChange={(event) => setProgress(Number(event.target.value))} className="mt-3 w-full"/></label>
                  </div>
                </>
              )}
            </div>
            <aside className="space-y-3">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><h3 className="font-semibold">What happens after save?</h3><p className="mt-1 text-xs leading-5">The same scheduling rules recalculate the edited Task, its ancestors, and all direct and transitive successors. Calendar and synchronization updates follow that one result.</p></div>
              <div className="rounded-lg border p-3 text-xs text-slate-600"><p className="font-semibold text-slate-800">Drag behavior</p><p className="mt-1 leading-5">Dragging an unlinked leaf updates its dates. Dragging a linked leaf keeps every dependency and adjusts its non-negative lag. Dragging progress stays between 0% and 100%.</p></div>
            </aside>
          </div>
          <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t bg-white px-5 py-4">
            <button type="button" onClick={() => setDialog(taskKind === "header" ? "delete-header" : "delete-leaf")} className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Delete Task</button>
            <div className="flex gap-2"><button type="button" onClick={() => setDialog(null)} className="rounded-md border px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" onClick={reviewTask} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Review schedule</button></div>
          </footer>
        </Modal>
      )}

      {dialog === "schedule-review" && <Modal title="Review Task schedule" onClose={() => setDialog("task")}>
        <div className="space-y-4 p-5 text-sm">
          <div className="rounded-lg border bg-slate-50 p-3"><dl className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-slate-500">Task</dt><dd className="font-semibold">{taskName}</dd><dt className="text-slate-500">Type</dt><dd>{taskKind === "header" ? "Header Task" : "Leaf Task"}</dd><dt className="text-slate-500">Parent</dt><dd>{parent}</dd>{taskKind === "leaf" && <><dt className="text-slate-500">Start method</dt><dd>{startMethod === "period" ? "Time Period" : `Linked · ${predecessors.length} predecessor${predecessors.length === 1 ? "" : "s"}`}</dd><dt className="text-slate-500">Duration</dt><dd>{duration} working days</dd><dt className="text-slate-500">Weekend work</dt><dd>Saturday {saturday ? "allowed" : "excluded"}; Sunday {sunday ? "allowed" : "excluded"}</dd><dt className="text-slate-500">Resources</dt><dd>{resources.length ? resources.join(", ") : "None selected"}</dd></>}</dl></div>
          {taskKind === "leaf" && startMethod === "period" && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">Inclusive schedule: <strong>{startDate}</strong> through <strong>{endDate}</strong>. Excluded weekend days do not consume Duration.</p>}
          {taskKind === "leaf" && startMethod === "link" && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950"><p className="font-semibold">Dependency calculation</p><p className="mt-1">All {predecessors.length} constraints are calculated with this Task&apos;s working-day rules. The latest valid result wins, then every successor cascades earlier or later until stable.</p></div>}
          {taskKind === "header" && <p className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-indigo-950">The Header&apos;s dates and weighted progress will be recalculated from descendant leaf Tasks. No Resource or dependency is assigned directly.</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t px-5 py-4"><button type="button" onClick={() => setDialog("task")} className="rounded-md border px-4 py-2 text-sm font-semibold">Back to edit</button><button type="button" onClick={completePreview} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Apply UI preview</button></footer>
      </Modal>}

      {dialog === "root" && <Modal title="Root Header Task is protected" role="alertdialog" onClose={() => setDialog(null)}><div className="space-y-3 p-5 text-sm"><p><strong>{projectName}</strong> is the one required root Header Task for this Project Plan.</p><ul className="list-disc space-y-1 pl-5 text-slate-700"><li>It cannot be deleted, converted to a leaf Task, or moved under another Task.</li><li>Its dates come from all descendant leaf Tasks.</li><li>Its weighted progress and End Date drive the Project summary.</li></ul></div><footer className="flex justify-end border-t px-5 py-4"><button type="button" onClick={() => setDialog(null)} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Understood</button></footer></Modal>}

      {dialog === "delete-header" && <Modal title="Header Task cannot be deleted" role="alertdialog" onClose={() => setDialog(null)}><div className="space-y-3 p-5 text-sm"><p><strong>Construction</strong> still contains 2 child Tasks.</p><p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">Move or delete every child first. Dialoggg will not cascade-delete child Tasks.</p></div><footer className="flex justify-end border-t px-5 py-4"><button type="button" onClick={() => setDialog(null)} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Return to Project Plan</button></footer></Modal>}

      {dialog === "delete-leaf" && <Modal title="Delete Task?" role="alertdialog" onClose={() => setDialog(null)}><div className="space-y-3 p-5 text-sm"><p>Delete <strong>Court surfacing</strong> from this Project Plan?</p><div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900"><p className="font-semibold">This action removes:</p><ul className="mt-1 list-disc pl-5"><li>the Task and its Resource assignments;</li><li>its incoming and outgoing dependency links.</li></ul></div><p>Affected Tasks, Headers, Project End Date, and calendars will be recalculated. No unrelated link will be removed.</p></div><footer className="flex justify-end gap-2 border-t px-5 py-4"><button type="button" onClick={() => setDialog(null)} className="rounded border px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" onClick={() => { setDialog(null); setNotice("Delete workflow preview complete. No Task, link, Resource assignment, or schedule was changed."); }} className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white">Delete Task</button></footer></Modal>}
    </section>
  );
}

