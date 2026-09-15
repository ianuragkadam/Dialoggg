"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { COMPANY_USERS_UI, USER_ACCESS_PROJECTS, companyRoleLabel, type CompanyRoleUi } from "@/lib/users-access-ui";

type InviteForm = {
  firstName: string;
  lastName: string;
  email: string;
  role: "employee" | "external";
  projectIds: string[];
  addAsResource: boolean;
};

const EMPTY_FORM: InviteForm = { firstName: "", lastName: "", email: "", role: "employee", projectIds: [], addAsResource: false };
const inputClass = "mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200";

export default function UserInvitePrototype() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof InviteForm, string>>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(EMPTY_FORM), [form]);

  useEffect(() => {
    if (!reviewOpen && !discardOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (discardOpen) setDiscardOpen(false);
      else setReviewOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [discardOpen, reviewOpen]);

  function update<K extends keyof InviteForm>(key: K, value: InviteForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: typeof errors = {};
    if (!form.firstName.trim()) next.firstName = "Enter the User's first name.";
    if (!form.lastName.trim()) next.lastName = "Enter the User's last name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Enter a valid login email address.";
    if (COMPANY_USERS_UI.some(user => user.email.toLocaleLowerCase() === form.email.trim().toLocaleLowerCase())) next.email = "A User with this login email already belongs to the company.";
    if (form.role === "external" && form.projectIds.length === 0) next.projectIds = "Assign an External/Client to at least one Project.";
    setErrors(next);
    if (Object.keys(next).length) {
      window.setTimeout(() => firstNameRef.current?.focus(), 0);
      return false;
    }
    return true;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (validate()) setReviewOpen(true);
  }

  function toggleProject(id: string) {
    update("projectIds", form.projectIds.includes(id) ? form.projectIds.filter(value => value !== id) : [...form.projectIds, id]);
  }

  if (completed) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-10">
        <section role="status" className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <div aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800">✓</div>
          <h1 className="mt-4 text-2xl font-bold text-slate-950">Invitation preview complete</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600"><strong>{form.firstName.trim()} {form.lastName.trim()}</strong> is ready to be invited as <strong>{companyRoleLabel(form.role)}</strong>.</p>
          <div className="mx-auto mt-5 max-w-xl rounded-lg border border-blue-200 bg-blue-50 p-4 text-left text-sm leading-6 text-blue-950"><strong>UI preview only:</strong> no User, membership, Resource, Project assignment, or invitation was created. No email was sent.</div>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Link href="/users" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">Return to Users</Link><button type="button" onClick={() => setCompleted(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Review invitation</button></div>
        </section>
      </div>
    );
  }

  const selectedProjects = USER_ACCESS_PROJECTS.filter(project => form.projectIds.includes(project.id));

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500"><Link href="/users" className="hover:text-blue-700">Users</Link><span aria-hidden="true" className="px-2">/</span><span className="font-medium text-slate-800">Invite User</span></nav>
      <div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Invite User</h1><p className="mt-2 text-sm leading-6 text-slate-600">Create a company membership and send a secure link so the person sets their own password.</p></div>
      <section aria-label="Prototype notice" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><p className="font-semibold">UI preview · Admin permissions</p><p>An Admin can invite Employees and External/Clients. Only an Owner can create or promote another Admin or Owner. This preview sends nothing.</p></section>

      <form onSubmit={submit} noValidate className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <section className="space-y-4 p-5" aria-labelledby="identity-title">
          <div><h2 id="identity-title" className="font-bold text-slate-950">User identity</h2><p className="mt-1 text-xs leading-5 text-slate-500">A login email is globally unique and can later join another company with a different Role.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="invite-first-name" className="text-sm font-bold text-slate-800">First Name <span aria-hidden="true" className="text-red-600">*</span></label><input ref={firstNameRef} id="invite-first-name" value={form.firstName} onChange={event => update("firstName", event.target.value)} aria-required="true" aria-invalid={!!errors.firstName} className={inputClass} />{errors.firstName && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.firstName}</p>}</div>
            <div><label htmlFor="invite-last-name" className="text-sm font-bold text-slate-800">Last Name <span aria-hidden="true" className="text-red-600">*</span></label><input id="invite-last-name" value={form.lastName} onChange={event => update("lastName", event.target.value)} aria-required="true" aria-invalid={!!errors.lastName} className={inputClass} />{errors.lastName && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.lastName}</p>}</div>
          </div>
          <div><label htmlFor="invite-email" className="text-sm font-bold text-slate-800">Login Email <span aria-hidden="true" className="text-red-600">*</span></label><input id="invite-email" type="email" value={form.email} onChange={event => update("email", event.target.value)} aria-required="true" aria-invalid={!!errors.email} autoComplete="off" placeholder="person@company.com" className={inputClass} />{errors.email && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.email}</p>}</div>
        </section>

        <section className="space-y-4 border-t border-slate-200 p-5" aria-labelledby="membership-title">
          <div><h2 id="membership-title" className="font-bold text-slate-950">Company membership</h2><p className="mt-1 text-xs leading-5 text-slate-500">Each membership has exactly one fixed Role. There is no custom permission builder.</p></div>
          <div><label htmlFor="invite-role" className="text-sm font-bold text-slate-800">Role <span aria-hidden="true" className="text-red-600">*</span></label><select id="invite-role" value={form.role} onChange={event => { const role = event.target.value as InviteForm["role"]; setForm(current => ({ ...current, role, projectIds: role === "external" ? current.projectIds : [] })); setErrors(current => ({ ...current, projectIds: undefined })); }} className={`${inputClass} bg-white`}><option value="employee">Employee (Internal)</option><option value="external">External/Client</option><option disabled>Admin — Owner required</option><option disabled>Owner — Owner required</option></select></div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4"><input type="checkbox" checked={form.addAsResource} onChange={event => update("addAsResource", event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" /><span><strong className="block text-sm text-slate-900">Also add as a Resource</strong><span className="mt-1 block text-xs leading-5 text-slate-500">Create a matching Resource and connect it one-to-one to this User in the current company, as approved in `FUP-010`.</span></span></label>
        </section>

        <section className="space-y-4 border-t border-slate-200 p-5" aria-labelledby="project-access-title">
          <div><h2 id="project-access-title" className="font-bold text-slate-950">Project access</h2><p className="mt-1 text-xs leading-5 text-slate-500">{form.role === "external" ? "External/Clients see only assigned Projects and need at least one assignment." : "Employees see all company schedules; assignment controls team membership, notifications, and Common-folder eligibility."}</p></div>
          <div className="grid gap-2 sm:grid-cols-2">{USER_ACCESS_PROJECTS.map(project => <label key={project.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" checked={form.projectIds.includes(project.id)} onChange={() => toggleProject(project.id)} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" /><span><strong className="block text-sm text-slate-900">{project.name}</strong><span className="text-xs text-slate-500">{project.projectType}</span></span></label>)}</div>
          {errors.projectIds && <p role="alert" className="text-sm font-semibold text-red-700">{errors.projectIds}</p>}
        </section>

        <section className="border-t border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600"><strong className="text-slate-900">Invitation security:</strong> the link expires after 72 hours, works once, and can be reissued. The Admin never enters or sees the User's password.</section>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => dirty ? setDiscardOpen(true) : window.location.assign("/users")} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Cancel</button><button type="submit" className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">Review invitation</button></div>
      </form>

      {reviewOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setReviewOpen(false); }}><div role="dialog" aria-modal="true" aria-labelledby="invite-review-title" aria-describedby="invite-review-description" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-xl">✉</div><h2 id="invite-review-title" className="mt-4 text-xl font-bold text-slate-950">Confirm User invitation</h2><p id="invite-review-description" className="mt-2 text-sm leading-6 text-slate-600">Review exactly what will be created and shared.</p><dl className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 text-sm"><Review label="User" value={`${form.firstName.trim()} ${form.lastName.trim()}`} /><Review label="Login Email" value={form.email.trim()} /><Review label="Role" value={companyRoleLabel(form.role as CompanyRoleUi)} /><Review label="Project assignments" value={selectedProjects.length ? selectedProjects.map(project => project.name).join(", ") : "None"} /><Review label="Linked Resource" value={form.addAsResource ? "Create and link" : "Do not create"} /></dl><div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-950">Connected behavior: create or attach the identity, add this company membership, apply Project assignments, optionally create one linked Resource, record an audit event, and send one 72-hour invitation. This preview does none of those things.</div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setReviewOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Back to edit</button><button type="button" onClick={() => { setReviewOpen(false); setCompleted(true); }} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">Confirm UI preview</button></div></div></div>}

      {discardOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="discard-invite-title" aria-describedby="discard-invite-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl">!</div><h2 id="discard-invite-title" className="mt-4 text-xl font-bold text-slate-950">Leave invitation setup?</h2><p id="discard-invite-description" className="mt-2 text-sm leading-6 text-slate-600">The User, Role, Resource, and Project choices will be discarded. No invitation has been sent.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setDiscardOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Keep editing</button><Link href="/users" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-600">Discard and leave</Link></div></div></div>}
    </div>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">{label}</dt><dd className="max-w-[65%] text-right font-semibold text-slate-900">{value}</dd></div>;
}
