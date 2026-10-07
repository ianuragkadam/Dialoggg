"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";
import { projectTypeFor, type ProjectTemplateOptionUi, type ProjectUiRecord, type ProjectUserOptionUi } from "@/lib/projects-ui";
import type { CompanyUserUi } from "@/lib/users-access-ui";
import { PROJECT_CALENDAR_COLORS } from "@/lib/project-colors";
import ColorSwatches from "@/components/ColorSwatches";
import ProjectStatusControl from "@/components/ProjectStatusControl";

type Form = {
  name: string; clientName: string; clientEmail: string; address: string; city: string;
  state: string; zip: string; phone: string; projectTypeId: string; startDate: string;
  calendarColor: string; note: string; planSource: "blank" | "template"; templateId: string; assignments: string[];
};
type Dialog = "rebase" | "review" | "discard" | null;
type ApiPayload = { data?: { project?: ProjectUiRecord }; error?: { message?: string; fields?: Record<string, string> } };
type ExternalInvite = { firstName: string; lastName: string; email: string };
type PendingInvite = { id: number; name: string; email: string };
const LIST_PAGE_SIZE = 10;
const empty: Form = { name: "", clientName: "", clientEmail: "", address: "", city: "", state: "", zip: "", phone: "", projectTypeId: "", startDate: "", calendarColor: PROJECT_CALENDAR_COLORS[0], note: "", planSource: "blank", templateId: "", assignments: [] };

export default function ProjectFormPrototype({ mode, project, projectTypes, availableUsers, templates = [] }: {
  mode: "create" | "edit"; project?: ProjectUiRecord;
  projectTypes: Array<{ id: number; name: string }>;
  availableUsers: ProjectUserOptionUi[]; templates?: ProjectTemplateOptionUi[];
}) {
  const initial = useMemo<Form>(() => project ? {
    name: project.name, clientName: project.client_name || "", clientEmail: project.client_email || "",
    address: project.address || "", city: project.city || "", state: project.state || "", zip: project.zip || "",
    phone: (project.phone || "").replace(/\D/g, "").slice(0, 10), projectTypeId: String(project.project_type_id), startDate: project.start_date,
    calendarColor: project.calendar_color || PROJECT_CALENDAR_COLORS[0], note: project.note || "", planSource: "blank", templateId: "",
    assignments: availableUsers.filter(user => user.assigned).map(user => String(user.id)),
  } : empty, [availableUsers, project]);
  const [form, setForm] = useState(initial);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rebase, setRebase] = useState<"date-only" | "shift-unfinished" | "">("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [savedProject, setSavedProject] = useState<ProjectUiRecord | null>(null);
  const [externalUsers, setExternalUsers] = useState<ProjectUserOptionUi[]>(() => availableUsers.filter(user => user.role === "external"));
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [queuedInvites, setQueuedInvites] = useState<ExternalInvite[]>([]);
  const [externalSearch, setExternalSearch] = useState("");
  const [searchLimit, setSearchLimit] = useState(LIST_PAGE_SIZE);
  const [assignedLimit, setAssignedLimit] = useState(LIST_PAGE_SIZE);
  const [pendingLimit, setPendingLimit] = useState(LIST_PAGE_SIZE);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<ExternalInvite>({ firstName: "", lastName: "", email: "" });
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteOutcome, setInviteOutcome] = useState("");
  const [idempotencyKey] = useState(() => typeof crypto === "undefined" ? `project-${Date.now()}` : crypto.randomUUID());
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || queuedInvites.length > 0;

  async function refreshExternalUsers(previousPending = pendingInvites) {
    const response = await fetch("/api/users", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { users?: CompanyUserUi[] };
    const external = (payload.users || []).filter(user => user.role === "external");
    const nextPending = external.filter(user => user.status === "pending" && !!project && user.projects.some(item => item.id === project.id && item.assigned));
    const previousPendingIds = new Set(previousPending.map(user => user.id));
    const accepted = external.filter(user => user.status === "active" && previousPendingIds.has(user.id) && user.projects.some(item => item.id === project?.id && item.assigned));
    if (accepted.length) setForm(current => ({ ...current, assignments: [...new Set([...current.assignments, ...accepted.map(user => String(user.id))])] }));
    setExternalUsers(external.filter(user => user.status === "active").map(user => ({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, role: "external", assigned: user.projects.some(item => item.id === project?.id && item.assigned) })));
    setPendingInvites(nextPending.map(user => ({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim(), email: user.email })));
  }

  useEffect(() => { void refreshExternalUsers([]); }, []);

  useEffect(() => {
    if (!dialog) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setDialog(null); };
    document.addEventListener("keydown", escape); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", escape); document.body.style.overflow = ""; };
  }, [busy, dialog]);

  function set<K extends keyof Form>(key: K, value: Form[K]) { setForm(previous => ({ ...previous, [key]: value })); setErrors(previous => ({ ...previous, [key]: "" })); setMessage(""); }
  function toggleAssignment(id: string) { set("assignments", form.assignments.includes(id) ? form.assignments.filter(item => item !== id) : [...form.assignments, id]); }
  async function submitExternalInvite() {
    const invite = { firstName: inviteForm.firstName.trim(), lastName: inviteForm.lastName.trim(), email: inviteForm.email.trim().toLowerCase() };
    if (!invite.firstName || !invite.lastName || !/^\S+@\S+\.\S+$/.test(invite.email)) { setInviteError("Enter a first name, last name, and valid email address."); return; }
    if (queuedInvites.some(item => item.email === invite.email) || externalUsers.some(user => user.email.toLowerCase() === invite.email) || pendingInvites.some(user => user.email.toLowerCase() === invite.email)) { setInviteError("This person is already listed or queued for an invitation."); return; }
    if (mode === "create") {
      setQueuedInvites(current => [...current, invite]); setInviteOpen(false); setInviteForm({ firstName: "", lastName: "", email: "" }); setInviteError(""); return;
    }
    setInviting(true); setInviteError("");
    const response = await authenticatedFetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...invite, role: "external", projectIds: [project!.id], addAsResource: false }) }).catch(() => null);
    const payload = await response?.json().catch(() => ({})) as { error?: string | { message?: string } } | undefined;
    setInviting(false);
    if (!response?.ok) { setInviteError(typeof payload?.error === "string" ? payload.error : payload?.error?.message || "The invitation could not be sent."); return; }
    setInviteOpen(false); setInviteForm({ firstName: "", lastName: "", email: "" }); await refreshExternalUsers();
  }
  function validate() {
    const next: Record<string, string> = {};
    const required: Array<[keyof Form, string]> = [["name", "Enter the Project Name."], ["clientName", "Enter the Client Name."], ["clientEmail", "Enter the Client Email."], ["address", "Enter the Address."], ["city", "Enter the City."], ["state", "Enter the State."], ["zip", "Enter the Zip."], ["phone", "Enter the Phone Number."], ["projectTypeId", "Choose a Project Type."], ["startDate", "Choose the Project Start Date."]];
    required.forEach(([key, error]) => { if (!String(form[key]).trim()) next[key] = error; });
    if (form.clientEmail && !/^\S+@\S+\.\S+$/.test(form.clientEmail)) next.clientEmail = "Enter a valid Client Email.";
    if (form.phone && !/^\d{1,10}$/.test(form.phone)) next.phone = "Use digits only, up to 10 digits.";
    if (form.planSource === "template" && !form.templateId) next.templateId = "Choose a Project Template or select Blank Project Plan.";
    setErrors(next); return !Object.keys(next).length;
  }
  function review() { if (!validate()) return; if (mode === "edit" && project && form.startDate !== project.start_date && !rebase) setDialog("rebase"); else setDialog("review"); }
  function chooseRebase(choice: "date-only" | "shift-unfinished") { setRebase(choice); setDialog("review"); }

  async function save() {
    setBusy(true); setMessage("");
    const response = await authenticatedFetch(mode === "create" ? "/api/v1/projects" : `/api/v1/projects/${project!.id}`, {
      method: mode === "create" ? "POST" : "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: form.name, clientName: form.clientName, clientEmail: form.clientEmail, address: form.address, city: form.city, state: form.state, zip: form.zip, phone: form.phone, projectTypeId: Number(form.projectTypeId), startDate: form.startDate, calendarColor: form.calendarColor, note: form.note, assignmentIds: form.assignments.map(Number), ...(mode === "create" ? { templateId: form.planSource === "template" ? Number(form.templateId) : null, idempotencyKey } : { version: project!.version, rebaseMode: rebase || "date-only" }) }),
    });
    const payload = await response.json().catch(() => ({})) as ApiPayload;
    if (!response.ok || !payload.data?.project) { setBusy(false); setErrors(payload.error?.fields || {}); setMessage(payload.error?.message || "The Project could not be saved."); setDialog(null); return; }
    if (mode === "create" && queuedInvites.length) {
      const failures: string[] = [];
      for (const invite of queuedInvites) {
        const result = await authenticatedFetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...invite, role: "external", projectIds: [payload.data.project.id], addAsResource: false }) }).catch(() => null);
        if (!result?.ok) failures.push(invite.email);
      }
      setInviteOutcome(failures.length ? `The Project was saved, but invitations could not be sent to: ${failures.join(", ")}. Open Edit Project to retry.` : `${queuedInvites.length} external invitation${queuedInvites.length === 1 ? "" : "s"} sent.`);
    }
    setBusy(false); setDialog(null); setSavedProject(payload.data.project);
  }

  const cancelHref = project ? `/projects/${project.id}` : "/projects";
  const assignedExternals = externalUsers.filter(user => form.assignments.includes(String(user.id)));
  const externalMatches = externalSearch.trim().length < 2 ? [] : externalUsers.filter(user => !form.assignments.includes(String(user.id)) && `${user.name} ${user.email}`.toLowerCase().includes(externalSearch.trim().toLowerCase()));
  const allPending = [...pendingInvites.map(user => ({ key: String(user.id), name: user.name, email: user.email, status: "Pending" })), ...queuedInvites.map(user => ({ key: user.email, name: `${user.firstName} ${user.lastName}`, email: user.email, status: "Sends after project save" }))];
  if (savedProject) return <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm"><div className="text-4xl" aria-hidden="true">✓</div><h1 className="mt-3 text-2xl font-bold text-slate-950">Project saved</h1><p className="mt-2 text-sm leading-6 text-slate-600">{savedProject.name} and its User assignments are saved. The Project End Date remains derived from scheduled leaf Tasks.</p>{inviteOutcome && <p role="status" className="mt-3 text-sm font-semibold">{inviteOutcome}</p>}<Link href={`/projects/${savedProject.id}`} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">Open Project</Link></div>;

  return <div className="mx-auto max-w-4xl space-y-6 pb-10">
    <h1 className="text-3xl font-bold text-slate-950">{mode === "create" ? "Add Project" : `Edit ${project?.name}`}</h1>
    {mode === "edit" && project && <ProjectStatusControl project={project} />}
    {message && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900">{message}</div>}
    <form onSubmit={event => { event.preventDefault(); review(); }} className="space-y-6" noValidate>
      <Section title="Project setup"><div className="grid gap-4 sm:grid-cols-2"><Field id="project-name" label="Project Name" value={form.name} error={errors.name} onChange={value => set("name", value)} /><ProjectTypeSelect value={form.projectTypeId} error={errors.projectTypeId} onChange={value => set("projectTypeId", value)} options={projectTypes} /></div><div className="mt-4"><Field id="project-start-date" type="date" label="Project Start Date" value={form.startDate} error={errors.startDate} onChange={value => { set("startDate", value); setRebase(""); }} /></div><fieldset className="mt-4"><legend className="text-sm font-bold text-slate-800">Project Calendar Color</legend><p className="mt-1 text-xs text-slate-600">All Tasks for this Project use this color on the Master Calendar. New Gantt Tasks default to this color; you can change each Task color independently.</p><ColorSwatches label="Project calendar color" colors={PROJECT_CALENDAR_COLORS} value={form.calendarColor} onChange={color => set("calendarColor", color)} />{errors.calendarColor && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.calendarColor}</p>}</fieldset><div className="mt-4"><label className="text-sm font-bold text-slate-800" htmlFor="project-note">Internal Note <span className="font-normal text-slate-500">(optional; never sent to Google Calendar)</span></label><textarea id="project-note" rows={3} value={form.note} onChange={event => set("note", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></div></Section>
      <Section title="Client and job site"><div className="grid gap-4 sm:grid-cols-2"><Field id="client-name" label="Client Name" value={form.clientName} error={errors.clientName} onChange={value => set("clientName", value)} /><Field id="client-email" label="Client Email" type="email" value={form.clientEmail} error={errors.clientEmail} onChange={value => set("clientEmail", value)} /><Field id="project-address" label="Address" value={form.address} error={errors.address} onChange={value => set("address", value)} /><Field id="project-city" label="City" value={form.city} error={errors.city} onChange={value => set("city", value)} /><Field id="project-state" label="State" value={form.state} error={errors.state} onChange={value => set("state", value)} /><Field id="project-zip" label="Zip" value={form.zip} error={errors.zip} onChange={value => set("zip", value)} /><Field id="client-phone" label="Phone Number" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={form.phone} error={errors.phone} onChange={value => set("phone", value.replace(/\D/g, "").slice(0, 10))} /></div></Section>
      {mode === "create" && <Section title="Project Plan starting point"><fieldset><legend className="text-sm font-bold text-slate-800">Choose one starting point</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><Choice checked={form.planSource === "blank"} title="Blank Project Plan" text="Open the original Gantt with no Template Tasks." onChange={() => set("planSource", "blank")} /><Choice checked={form.planSource === "template"} title="Start from Project Template" text="Create ordinary editable Tasks in the original Gantt." onChange={() => set("planSource", "template")} /></div></fieldset>{form.planSource === "template" && <div className="mt-4"><TemplateSelect value={form.templateId} error={errors.templateId} onChange={value => set("templateId", value)} options={templates} /></div>}</Section>}
      <Section title="Internal Users"><p className="mb-3 text-sm text-slate-600">Select all Internal Users (Company Users) to be assigned to this project.</p><div className="grid gap-3 sm:grid-cols-2">{availableUsers.filter(user => user.role !== "external").map(user => <label key={user.id} className="flex min-h-12 items-start gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" checked={form.assignments.includes(String(user.id))} onChange={() => toggleAssignment(String(user.id))} className="mt-1 h-4 w-4" /><span><strong className="block text-sm text-slate-900">{user.name}</strong><span className="text-xs text-slate-500">{user.email} · {roleLabel(user.role)}</span></span></label>)}</div></Section>
      <Section title="External Users">
        <label htmlFor="external-user-search" className="text-sm font-bold text-slate-800">Search external users</label>
        <input id="external-user-search" type="search" value={externalSearch} onChange={event => { setExternalSearch(event.target.value); setSearchLimit(LIST_PAGE_SIZE); }} placeholder="Search by name or email" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
        {externalSearch.trim().length >= 2 && <div className="mt-3 space-y-2" aria-live="polite">{externalMatches.length ? externalMatches.slice(0, searchLimit).map(user => <div key={user.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><span className="min-w-0 text-sm"><strong className="block text-slate-900">{user.name}</strong><span className="break-all text-slate-600">{user.email}</span></span><button type="button" onClick={() => toggleAssignment(String(user.id))} className="min-h-10 rounded-lg bg-blue-700 px-3 text-sm font-bold text-white">Assign</button></div>) : <p className="text-sm text-slate-600">No matching external users.</p>}<LoadMoreButton shown={searchLimit} total={externalMatches.length} onClick={() => setSearchLimit(value => value + LIST_PAGE_SIZE)} /></div>}
        {assignedExternals.length > 0 && <div className="mt-5"><h3 className="text-sm font-bold text-slate-900">Assigned External Users</h3><div className="mt-2 space-y-2">{assignedExternals.slice(0, assignedLimit).map(user => <div key={user.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><span className="min-w-0 text-sm"><strong className="block text-slate-900">{user.name}</strong><span className="break-all text-slate-600">{user.email}</span></span><button type="button" onClick={() => toggleAssignment(String(user.id))} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold">Remove</button></div>)}<LoadMoreButton shown={assignedLimit} total={assignedExternals.length} onClick={() => setAssignedLimit(value => value + LIST_PAGE_SIZE)} /></div></div>}
        <button type="button" onClick={() => { setInviteError(""); setInviteOpen(true); }} className="mt-5 min-h-11 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white">Invite External User</button>
        <div className="mt-5"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">Pending Invitations</h3><button type="button" onClick={() => void refreshExternalUsers()} className="text-sm font-semibold text-blue-700 underline">Refresh</button></div>{allPending.length ? <div className="mt-2"><ul className="space-y-2">{allPending.slice(0, pendingLimit).map(user => <li key={user.key} className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">{user.name} · {user.email} <span className="text-amber-700">({user.status})</span></li>)}</ul><LoadMoreButton shown={pendingLimit} total={allPending.length} onClick={() => setPendingLimit(value => value + LIST_PAGE_SIZE)} /></div> : <p className="mt-2 text-sm text-slate-600">No pending invitations for this project.</p>}</div>
      </Section>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => dirty ? setDialog("discard") : location.assign(cancelHref)} className="min-h-11 rounded-lg border border-slate-300 px-5 py-2 text-sm font-bold">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-blue-700 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">Review Project</button></div>
    </form>
    {inviteOpen && <Modal title="Invite External User"><div className="space-y-3"><Field id="external-first-name" label="First Name" value={inviteForm.firstName} onChange={value => setInviteForm(current => ({ ...current, firstName: value }))} /><Field id="external-last-name" label="Last Name" value={inviteForm.lastName} onChange={value => setInviteForm(current => ({ ...current, lastName: value }))} /><Field id="external-email" label="Email" type="email" value={inviteForm.email} onChange={value => setInviteForm(current => ({ ...current, email: value }))} /></div>{mode === "create" && <p className="mt-3 text-sm text-slate-600">You can add multiple invitations. They will be sent after this project is saved.</p>}{inviteError && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{inviteError}</p>}<Actions cancel="Cancel" confirm={inviting ? "Sending…" : mode === "create" ? "Add Invitation" : "Send Invitation"} onCancel={() => !inviting && setInviteOpen(false)} onConfirm={() => void submitExternalInvite()} disabled={inviting} /></Modal>}
    {dialog === "rebase" && <Modal title="How should the schedule respond?" alert><p className="text-sm leading-6 text-slate-600">The Project Start Date changed from <strong>{project?.start_date}</strong> to <strong>{form.startDate}</strong>. Choose what happens to the existing Project Plan.</p><div className="mt-4 space-y-3"><button autoFocus type="button" onClick={() => chooseRebase("date-only")} className="w-full rounded-lg border border-slate-300 p-3 text-left"><strong className="block text-slate-900">Change Project Date only</strong><span className="text-sm text-slate-600">Leave every Task date unchanged.</span></button><button type="button" onClick={() => chooseRebase("shift-unfinished")} className="w-full rounded-lg border border-blue-300 bg-blue-50 p-3 text-left"><strong className="block text-blue-950">Shift unfinished Tasks</strong><span className="text-sm text-blue-900">Move unfinished Tasks by the same working-day amount while preserving links and spacing.</span></button></div><div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><strong>Completed Tasks never move.</strong><p>{project?.completed_task_count || 0} completed Task(s) remain fixed as history. {Math.max((project?.task_count || 0) - (project?.completed_task_count || 0), 0)} unfinished Task(s) are eligible to shift.</p></div><Actions cancel="Back to edit" confirm={null} onCancel={() => setDialog(null)} /></Modal>}
    {dialog === "review" && <Modal title={mode === "create" ? "Confirm Project" : "Confirm Project changes"}><dl className="grid grid-cols-[145px_1fr] gap-2 text-sm"><DT>Project</DT><DD>{form.name}</DD><DT>Project Type</DT><DD>{projectTypes.find(type => String(type.id) === form.projectTypeId)?.name || (project ? projectTypeFor(project) : "Unavailable")}</DD><DT>Status</DT><DD>Active</DD><DT>Start Date</DT><DD>{form.startDate}</DD><DT>End Date</DT><DD>Derived from scheduled leaf Tasks</DD><DT>Client</DT><DD>{form.clientName} · {form.clientEmail}</DD><DT>Job site</DT><DD>{form.address}, {form.city}, {form.state} {form.zip}</DD><DT>Phone</DT><DD>{form.phone}</DD>{mode === "create" && <><DT>Project Plan</DT><DD>{form.planSource === "blank" ? "Blank Project Plan" : `Start from ${templates.find(template => String(template.id) === form.templateId)?.name}`}</DD></>}{mode === "edit" && form.startDate !== project?.start_date && <><DT>Schedule response</DT><DD>{rebase === "shift-unfinished" ? "Shift unfinished Tasks; completed Tasks remain fixed" : "Change Project Date only; no Tasks move"}</DD></>}<DT>Assigned Users</DT><DD>{form.assignments.length ? availableUsers.filter(user => form.assignments.includes(String(user.id))).map(user => user.name).join(", ") : "Acting Owner/Admin only"}</DD></dl><p className="mt-4 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-900">Confirming saves the Project and assignments in Dialoggg. Connected Google and Microsoft operations remain governed by their separate integration workflows.</p><Actions cancel="Back to edit" confirm={busy ? "Saving…" : "Save Project"} onCancel={() => !busy && setDialog(null)} onConfirm={save} disabled={busy} /></Modal>}
    {dialog === "discard" && <Modal title="Leave Project setup?" alert><p className="text-sm leading-6 text-slate-600">Your unsaved Project details will be discarded.</p><Actions cancel="Keep editing" confirm="Discard changes" onCancel={() => setDialog(null)} onConfirm={() => location.assign(cancelHref)} danger /></Modal>}
  </div>;
}

function roleLabel(role: ProjectUserOptionUi["role"]) { return role === "owner" ? "Owner" : role === "admin" ? "Admin" : role === "employee" ? "Employee (Internal)" : "External/Client"; }
function LoadMoreButton({ shown, total, onClick }: { shown: number; total: number; onClick: () => void }) { return shown < total ? <button type="button" onClick={onClick} className="mt-2 min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold text-blue-700">Load more ({Math.min(shown, total)} of {total})</button> : null; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-bold text-slate-950">{title}</h2>{children}</section>; }
function Field({ id, label, value, error, onChange, type = "text", inputMode, pattern, maxLength }: { id: string; label: string; value: string; error?: string; onChange: (value: string) => void; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; pattern?: string; maxLength?: number }) { return <div><label htmlFor={id} className="text-sm font-bold text-slate-800">{label} *</label><input id={id} type={type} inputMode={inputMode} pattern={pattern} maxLength={maxLength} value={value} onChange={event => onChange(event.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />{error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-semibold text-red-700">{error}</p>}</div>; }
function ProjectTypeSelect({ value, error, onChange, options }: { value: string; error?: string; onChange: (value: string) => void; options: Array<{ id: number; name: string }> }) { return <div><label htmlFor="project-type-choice" className="text-sm font-bold text-slate-800">Project Type *</label><select id="project-type-choice" value={value} onChange={event => onChange(event.target.value)} aria-invalid={!!error} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Choose Project Type</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>{error && <p className="mt-1 text-sm font-semibold text-red-700">{error}</p>}{!options.length && <p className="mt-1 text-sm text-amber-700">Create a Project Type in Settings before adding a Project.</p>}</div>; }
function TemplateSelect({ value, error, onChange, options }: { value: string; error?: string; onChange: (value: string) => void; options: ProjectTemplateOptionUi[] }) { return <div><label htmlFor="project-template" className="text-sm font-bold text-slate-800">Project Template *</label><select id="project-template" value={value} onChange={event => onChange(event.target.value)} aria-invalid={!!error} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Choose Project Template</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>{error && <p className="mt-1 text-sm font-semibold text-red-700">{error}</p>}{!options.length && <p className="mt-1 text-sm text-amber-700">No active Project Templates are available.</p>}</div>; }
function Choice({ checked, title, text, onChange }: { checked: boolean; title: string; text: string; onChange: () => void }) { return <label className={`flex gap-3 rounded-lg border p-4 ${checked ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}><input type="radio" name="plan-source" checked={checked} onChange={onChange} className="mt-1" /><span><strong className="block text-sm text-slate-900">{title}</strong><span className="text-xs leading-5 text-slate-600">{text}</span></span></label>; }
function Modal({ title, children, alert = false }: { title: string; children: React.ReactNode; alert?: boolean }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-xl font-bold text-slate-950">{title}</h2><div className="mt-4">{children}</div></div></div>; }
function Actions({ cancel, confirm, onCancel, onConfirm, danger = false, disabled = false }: { cancel: string; confirm: string | null; onCancel: () => void; onConfirm?: () => void; danger?: boolean; disabled?: boolean }) { return <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={onCancel} disabled={disabled} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50">{cancel}</button>{confirm && <button type="button" onClick={onConfirm} disabled={disabled} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${danger ? "bg-red-700" : "bg-blue-700"}`}>{confirm}</button>}</div>; }
function DT({ children }: { children: React.ReactNode }) { return <dt className="font-bold text-slate-500">{children}</dt>; }
function DD({ children }: { children: React.ReactNode }) { return <dd className="text-slate-900">{children}</dd>; }
