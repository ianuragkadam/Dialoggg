"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { authenticatedFetch } from "@/lib/client-fetch";

export default function CompanyCreatePrototype({ timeZones }: { timeZones: string[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ companyName: "", timeZone: "", firstName: "", lastName: "", ownerEmail: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [createdCompanyId, setCreatedCompanyId] = useState<number | null>(null);
  const [invitationExpiresAt, setInvitationExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [timeZoneOpen, setTimeZoneOpen] = useState(false);
  const [timeZoneQuery, setTimeZoneQuery] = useState("");
  const companyNameRef = useRef<HTMLInputElement>(null);
  const dirty = Object.values(form).some(Boolean);
  const modalOpen = reviewOpen || discardOpen;
  const prioritizedTimeZones = useMemo(() => {
    const preferred = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];
    return [...preferred.filter(zone => timeZones.includes(zone)), ...timeZones.filter(zone => !preferred.includes(zone))];
  }, [timeZones]);
  const commonTimeZones = useMemo(() => prioritizedTimeZones.slice(0, 6), [prioritizedTimeZones]);
  const matchingTimeZones = useMemo(() => {
    const query = timeZoneQuery.trim().toLowerCase();
    return prioritizedTimeZones.filter(zone => !query || zone.toLowerCase().includes(query));
  }, [prioritizedTimeZones, timeZoneQuery]);

  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (discardOpen) setDiscardOpen(false);
      else setReviewOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modalOpen, reviewOpen, discardOpen]);

  function update(key: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: "" }));
  }

  function review(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const name = form.companyName.trim();
    if (!name) next.companyName = "Enter the Company Name.";
    if (!form.timeZone) next.timeZone = "Choose the company's required time zone.";
    if (!form.firstName.trim()) next.firstName = "Enter the first Owner's first name.";
    if (!form.lastName.trim()) next.lastName = "Enter the first Owner's last name.";
    if (!/^\S+@\S+\.\S+$/.test(form.ownerEmail.trim())) next.ownerEmail = "Enter a valid Owner email address.";
    setErrors(next);
    if (Object.keys(next).length) return companyNameRef.current?.focus();
    setReviewOpen(true);
  }

  async function createCompany() {
    setSaving(true);
    setApiError("");
    try {
      const response = await authenticatedFetch("/api/v1/platform/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.companyName,
          timeZone: form.timeZone,
          ownerFirstName: form.firstName,
          ownerLastName: form.lastName,
          ownerEmail: form.ownerEmail,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        data?: { company?: { id?: number }; invitationExpiresAt?: string };
        error?: { message?: string; fields?: Record<string, string> };
      } | null;
      if (!response.ok) {
        if (payload?.error?.fields) setErrors(payload.error.fields);
        throw new Error(payload?.error?.message || "The company could not be created.");
      }
      const companyId = payload?.data?.company?.id;
      if (!companyId) throw new Error("The company was created, but its confirmation could not be loaded.");
      setCreatedCompanyId(companyId);
      setInvitationExpiresAt(payload?.data?.invitationExpiresAt || "");
      setReviewOpen(false);
      router.refresh();
    } catch (reason) {
      setApiError(reason instanceof Error ? reason.message : "The company could not be created.");
      setReviewOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (createdCompanyId) {
    return <div className="mx-auto max-w-3xl pb-10"><section role="status" className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm"><div aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800">✓</div><h1 className="mt-4 text-2xl font-bold text-slate-950">Company created</h1><p className="mt-2 text-sm leading-6 text-slate-600"><strong>{form.companyName.trim()}</strong> is active in <strong>{form.timeZone}</strong>.</p><div className="mx-auto mt-5 max-w-xl rounded-lg border border-blue-200 bg-blue-50 p-4 text-left text-sm leading-6 text-blue-950"><strong>Owner invitation queued:</strong> {form.firstName.trim()} {form.lastName.trim()} can use the single-use invitation sent to {form.ownerEmail.trim()}.{invitationExpiresAt && <> It expires {new Date(invitationExpiresAt).toLocaleString()}.</>}</div><div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Link href={`/platform/companies/${createdCompanyId}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">View company</Link><Link href="/platform/companies" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Return to Companies</Link></div></section></div>;
  }

  const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200";
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><Link href="/platform/companies" className="hover:text-blue-700">Companies</Link><span aria-hidden="true">/</span><span className="font-medium text-slate-800">Add Company</span></nav>
      <div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Add Company</h1><p className="mt-2 text-sm leading-6 text-slate-600">Enter new company to send a secure invitation to its first Owner.</p></div>
      {apiError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{apiError}</div>}
      <form onSubmit={review} noValidate className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <section className="space-y-4 p-5" aria-labelledby="company-information-title"><div><h2 id="company-information-title" className="font-bold text-slate-950">Company information</h2><p className="mt-1 text-xs leading-5 text-slate-500">The time zone controls timed Events and future calendar synchronization.</p></div><div><label htmlFor="company-name" className="block text-sm font-bold text-slate-800">Company Name <span aria-hidden="true" className="text-red-600">*</span></label><input ref={companyNameRef} id="company-name" value={form.companyName} onChange={event => update("companyName", event.target.value)} aria-required="true" aria-invalid={!!errors.companyName} aria-describedby={errors.companyName ? "company-name-error" : undefined} maxLength={100} placeholder="Example: Keystone Court Builders" className={inputClass} />{errors.companyName && <p id="company-name-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.companyName}</p>}</div><div className="relative"><label htmlFor="company-time-zone" className="block text-sm font-bold text-slate-800">Company Time Zone <span aria-hidden="true" className="text-red-600">*</span></label><div className="relative"><input id="company-time-zone" role="combobox" aria-expanded={timeZoneOpen} aria-controls="company-time-zone-list" aria-autocomplete="list" value={timeZoneOpen ? timeZoneQuery : form.timeZone} onFocus={() => { setTimeZoneQuery(form.timeZone); setTimeZoneOpen(true); }} onChange={event => { setTimeZoneQuery(event.target.value); setTimeZoneOpen(true); update("timeZone", ""); }} aria-required="true" aria-invalid={!!errors.timeZone} aria-describedby={errors.timeZone ? "company-time-zone-help company-time-zone-error" : "company-time-zone-help"} placeholder="Search or choose a time zone" className={`${inputClass} bg-white pr-10`} /><span aria-hidden="true" className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-transform ${timeZoneOpen ? "rotate-180" : ""}`}>⌄</span></div>{timeZoneOpen && <div id="company-time-zone-list" role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white p-1 shadow-xl"><p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Common US time zones</p>{commonTimeZones.filter(zone => matchingTimeZones.includes(zone)).map(zone => <button key={zone} type="button" role="option" aria-selected={form.timeZone === zone} onMouseDown={event => event.preventDefault()} onClick={() => { update("timeZone", zone); setTimeZoneQuery(zone); setTimeZoneOpen(false); }} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none">{zone}</button>)}<p className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-slate-500">All time zones</p>{matchingTimeZones.filter(zone => !commonTimeZones.includes(zone)).map(zone => <button key={zone} type="button" role="option" aria-selected={form.timeZone === zone} onMouseDown={event => event.preventDefault()} onClick={() => { update("timeZone", zone); setTimeZoneQuery(zone); setTimeZoneOpen(false); }} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none">{zone}</button>)}{matchingTimeZones.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">No matching time zones.</p>}</div>}<p id="company-time-zone-help" className="mt-1 text-xs text-slate-500">Common US time zones are shown first. Search for any other IANA time zone.</p>{errors.timeZone && <p id="company-time-zone-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.timeZone}</p>}</div></section>
        <section className="space-y-4 border-t border-slate-200 p-5" aria-labelledby="first-owner-title"><div><h2 id="first-owner-title" className="font-bold text-slate-950">First Owner</h2><p className="mt-1 text-xs leading-5 text-slate-500">This person receives a 72-hour, single-use invitation link to set their own password, as approved in `FUP-015`.</p></div><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="owner-first-name" className="block text-sm font-bold text-slate-800">First Name <span aria-hidden="true" className="text-red-600">*</span></label><input id="owner-first-name" value={form.firstName} onChange={event => update("firstName", event.target.value)} aria-required="true" aria-invalid={!!errors.firstName} className={inputClass} />{errors.firstName && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.firstName}</p>}</div><div><label htmlFor="owner-last-name" className="block text-sm font-bold text-slate-800">Last Name <span aria-hidden="true" className="text-red-600">*</span></label><input id="owner-last-name" value={form.lastName} onChange={event => update("lastName", event.target.value)} aria-required="true" aria-invalid={!!errors.lastName} className={inputClass} />{errors.lastName && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.lastName}</p>}</div></div><div><label htmlFor="owner-email" className="block text-sm font-bold text-slate-800">Login Email <span aria-hidden="true" className="text-red-600">*</span></label><input id="owner-email" type="email" value={form.ownerEmail} onChange={event => update("ownerEmail", event.target.value)} aria-required="true" aria-invalid={!!errors.ownerEmail} autoComplete="off" placeholder="owner@company.com" className={inputClass} />{errors.ownerEmail && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.ownerEmail}</p>}</div></section>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 p-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => dirty ? setDiscardOpen(true) : window.location.assign("/platform/companies")} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Cancel</button><button type="submit" className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">Review company setup</button></div>
      </form>
      {reviewOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={event => { if (!saving && event.target === event.currentTarget) setReviewOpen(false); }}><div role="dialog" aria-modal="true" aria-labelledby="review-company-title" aria-describedby="review-company-description" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-xl">🏢</div><h2 id="review-company-title" className="mt-4 text-xl font-bold text-slate-950">Confirm company setup</h2><p id="review-company-description" className="mt-2 text-sm leading-6 text-slate-600">Check the company boundary and first Owner before provisioning.</p><dl className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 text-sm"><div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">Company</dt><dd className="text-right font-semibold">{form.companyName.trim()}</dd></div><div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">Time Zone</dt><dd className="font-semibold">{form.timeZone}</dd></div><div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">First Owner</dt><dd className="text-right font-semibold">{form.firstName.trim()} {form.lastName.trim()}</dd></div><div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">Invitation</dt><dd className="text-right font-semibold">{form.ownerEmail.trim()}</dd></div></dl><div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-950">Confirmation creates the company, queues one encrypted Owner invitation, and records an audit event. No password is created or exposed to the Platform Administrator.</div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus disabled={saving} onClick={() => setReviewOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">Back to edit</button><button type="button" disabled={saving} onClick={createCompany} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">{saving ? "Creating…" : "Create Company and send Owner invite"}</button></div></div></div>}
      {discardOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="discard-company-title" aria-describedby="discard-company-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl">!</div><h2 id="discard-company-title" className="mt-4 text-xl font-bold text-slate-950">Leave company setup?</h2><p id="discard-company-description" className="mt-2 text-sm leading-6 text-slate-600">The company and first Owner information will be discarded. No invitation has been sent.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setDiscardOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600">Keep editing</button><Link href="/platform/companies" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-600">Discard and leave</Link></div></div></div>}
    </div>
  );
}
