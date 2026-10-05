"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import type { CompanyOperationalMetadata } from "@/lib/company-administration";
import { authenticatedFetch } from "@/lib/client-fetch";

export default function CompanyEditPrototype({ company, timeZones }: { company: CompanyOperationalMetadata; timeZones: string[] }) {
  const router = useRouter();
  const [name, setName] = useState(company.name);
  const [timeZone, setTimeZone] = useState(company.timeZone);
  const [firstName, setFirstName] = useState(company.ownerFirstName);
  const [lastName, setLastName] = useState(company.ownerLastName);
  const [ownerEmail, setOwnerEmail] = useState(company.ownerEmail === "Invitation pending" ? "" : company.ownerEmail);
  const [timeZoneOpen, setTimeZoneOpen] = useState(false);
  const [timeZoneQuery, setTimeZoneQuery] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [saving, setSaving] = useState(false);
  const companyNameRef = useRef<HTMLInputElement>(null);
  const timeZoneRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const ownerEmailRef = useRef<HTMLInputElement>(null);
  const prioritizedTimeZones = useMemo(() => {
    const preferred = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];
    return [...preferred.filter(zone => timeZones.includes(zone)), ...timeZones.filter(zone => !preferred.includes(zone))];
  }, [timeZones]);
  const commonTimeZones = useMemo(() => prioritizedTimeZones.slice(0, 6), [prioritizedTimeZones]);
  const matchingTimeZones = useMemo(() => {
    const query = timeZoneQuery.trim().toLowerCase();
    return prioritizedTimeZones.filter(zone => !query || zone.toLowerCase().includes(query));
  }, [prioritizedTimeZones, timeZoneQuery]);

  function updateField(field: "companyName" | "timeZone" | "firstName" | "lastName" | "ownerEmail", value: string) {
    if (field === "companyName") setName(value);
    else if (field === "timeZone") setTimeZone(value);
    else if (field === "firstName") setFirstName(value);
    else if (field === "lastName") setLastName(value);
    else setOwnerEmail(value);
    setErrors(current => ({ ...current, [field]: "" }));
  }

  function focusFirstError(fields: Record<string, string>) {
    if (fields.companyName) companyNameRef.current?.focus();
    else if (fields.timeZone) timeZoneRef.current?.focus();
    else if (fields.firstName) firstNameRef.current?.focus();
    else if (fields.lastName) lastNameRef.current?.focus();
    else if (fields.ownerEmail) ownerEmailRef.current?.focus();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const normalizedName = name.trim().replace(/\s+/g, " ");
    if (!normalizedName || normalizedName.length > 100) nextErrors.companyName = "Enter the Company Name.";
    if (!timeZone || !timeZones.includes(timeZone)) nextErrors.timeZone = "Choose the company's required time zone.";
    const normalizedFirstName = firstName.trim().replace(/\s+/g, " ");
    const normalizedLastName = lastName.trim().replace(/\s+/g, " ");
    const normalizedOwnerEmail = ownerEmail.trim().toLowerCase();
    if (company.ownerDetailsEditable) {
      if (!normalizedFirstName || normalizedFirstName.length > 80) nextErrors.firstName = "Enter the first Owner's first name.";
      if (!normalizedLastName || normalizedLastName.length > 80) nextErrors.lastName = "Enter the first Owner's last name.";
      if (!/^\S+@\S+\.\S+$/.test(normalizedOwnerEmail) || normalizedOwnerEmail.length > 254) nextErrors.ownerEmail = "Enter a valid Owner email address.";
    }
    setErrors(nextErrors);
    setApiError("");
    if (Object.keys(nextErrors).length) {
      focusFirstError(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const response = await authenticatedFetch(`/api/v1/platform/companies/${company.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          timeZone,
          ...(company.ownerDetailsEditable ? { firstName: normalizedFirstName, lastName: normalizedLastName, ownerEmail: normalizedOwnerEmail } : {}),
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: { message?: string; fields?: Record<string, string> } } | null;
      if (!response.ok) {
        if (payload?.error?.fields) {
          setErrors(payload.error.fields);
          focusFirstError(payload.error.fields);
        }
        throw new Error(payload?.error?.message || "Company details could not be saved.");
      }
      router.push(`/platform/companies/${company.id}`);
      router.refresh();
    } catch (reason) {
      setApiError(reason instanceof Error ? reason.message : "Company details could not be saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200";
  return <div className="mx-auto max-w-3xl space-y-6 pb-10">
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><Link href="/platform/companies" className="hover:text-blue-700">Companies</Link><span aria-hidden="true">/</span><Link href={`/platform/companies/${company.id}`} className="hover:text-blue-700">{company.name}</Link><span aria-hidden="true">/</span><span className="font-medium text-slate-800">Edit</span></nav>
    <div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Edit Company</h1><p className="mt-2 text-sm text-slate-600">Update company information and its first Owner. Subscription dates are managed separately by the Platform Owner.</p></div>
    {apiError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{apiError}</div>}
    <form noValidate onSubmit={submit} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <section className="space-y-4 p-5" aria-labelledby="edit-company-information-title">
        <div><h2 id="edit-company-information-title" className="font-bold text-slate-950">Company information</h2><p className="mt-1 text-xs leading-5 text-slate-500">The time zone controls timed Events and future calendar synchronization.</p></div>
        <div><label htmlFor="edit-company-name" className="block text-sm font-bold text-slate-800">Company Name <span aria-hidden="true" className="text-red-600">*</span></label><input ref={companyNameRef} id="edit-company-name" value={name} maxLength={100} required aria-required="true" aria-invalid={!!errors.companyName} aria-describedby={errors.companyName ? "edit-company-name-error" : undefined} onChange={event => updateField("companyName", event.target.value)} placeholder="Example: Keystone Court Builders" className={inputClass} />{errors.companyName && <p id="edit-company-name-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.companyName}</p>}</div>
        <div className="relative"><label htmlFor="edit-company-time-zone" className="block text-sm font-bold text-slate-800">Company Time Zone <span aria-hidden="true" className="text-red-600">*</span></label><div className="relative"><input ref={timeZoneRef} id="edit-company-time-zone" role="combobox" aria-expanded={timeZoneOpen} aria-controls="edit-company-time-zone-list" aria-autocomplete="list" value={timeZoneOpen ? timeZoneQuery : timeZone} onFocus={() => { setTimeZoneQuery(timeZone); setTimeZoneOpen(true); }} onChange={event => { setTimeZoneQuery(event.target.value); setTimeZoneOpen(true); updateField("timeZone", ""); }} aria-required="true" aria-invalid={!!errors.timeZone} aria-describedby={errors.timeZone ? "edit-company-time-zone-help edit-company-time-zone-error" : "edit-company-time-zone-help"} placeholder="Search or choose a time zone" className={`${inputClass} bg-white pr-10`} /><span aria-hidden="true" className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-transform ${timeZoneOpen ? "rotate-180" : ""}`}>⌄</span></div>{timeZoneOpen && <div id="edit-company-time-zone-list" role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white p-1 shadow-xl"><p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Common US time zones</p>{commonTimeZones.filter(zone => matchingTimeZones.includes(zone)).map(zone => <button key={zone} type="button" role="option" aria-selected={timeZone === zone} onMouseDown={event => event.preventDefault()} onClick={() => { updateField("timeZone", zone); setTimeZoneQuery(zone); setTimeZoneOpen(false); }} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none">{zone}</button>)}<p className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-slate-500">All time zones</p>{matchingTimeZones.filter(zone => !commonTimeZones.includes(zone)).map(zone => <button key={zone} type="button" role="option" aria-selected={timeZone === zone} onMouseDown={event => event.preventDefault()} onClick={() => { updateField("timeZone", zone); setTimeZoneQuery(zone); setTimeZoneOpen(false); }} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none">{zone}</button>)}{matchingTimeZones.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">No matching time zones.</p>}</div>}<p id="edit-company-time-zone-help" className="mt-1 text-xs text-slate-500">Common US time zones are shown first. Search for any other IANA time zone.</p>{errors.timeZone && <p id="edit-company-time-zone-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.timeZone}</p>}</div>
      </section>
      <section className="space-y-4 border-t border-slate-200 p-5" aria-labelledby="edit-first-owner-title"><div><h2 id="edit-first-owner-title" className="font-bold text-slate-950">First Owner</h2><p className="mt-1 text-xs leading-5 text-slate-500">The Owner receives a single-use invitation link to set their password. Updating a pending Owner will resend the invitation and invalidate the previous link.</p></div>{!company.ownerDetailsEditable && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">This Owner's identity is already active or linked to another company. They can update their name and login email from Account settings; email changes require verification.</p>}<div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="edit-owner-first-name" className="block text-sm font-bold text-slate-800">First Name <span aria-hidden="true" className="text-red-600">*</span></label><input ref={firstNameRef} id="edit-owner-first-name" value={firstName} onChange={event => updateField("firstName", event.target.value)} maxLength={80} disabled={!company.ownerDetailsEditable} aria-required="true" aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "edit-owner-first-name-error" : undefined} className={`${inputClass} disabled:bg-slate-100`} />{errors.firstName && <p id="edit-owner-first-name-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.firstName}</p>}</div><div><label htmlFor="edit-owner-last-name" className="block text-sm font-bold text-slate-800">Last Name <span aria-hidden="true" className="text-red-600">*</span></label><input ref={lastNameRef} id="edit-owner-last-name" value={lastName} onChange={event => updateField("lastName", event.target.value)} maxLength={80} disabled={!company.ownerDetailsEditable} aria-required="true" aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "edit-owner-last-name-error" : undefined} className={`${inputClass} disabled:bg-slate-100`} />{errors.lastName && <p id="edit-owner-last-name-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.lastName}</p>}</div></div><div><label htmlFor="edit-owner-email" className="block text-sm font-bold text-slate-800">Login Email <span aria-hidden="true" className="text-red-600">*</span></label><input ref={ownerEmailRef} id="edit-owner-email" type="email" value={ownerEmail} onChange={event => updateField("ownerEmail", event.target.value)} maxLength={254} autoComplete="off" disabled={!company.ownerDetailsEditable} aria-required="true" aria-invalid={!!errors.ownerEmail} aria-describedby={errors.ownerEmail ? "edit-owner-email-help edit-owner-email-error" : "edit-owner-email-help"} placeholder="owner@company.com" className={`${inputClass} disabled:bg-slate-100`} /><p id="edit-owner-email-help" className="mt-1 text-xs text-slate-500">A new secure invitation is sent to this address when the pending Owner email changes.</p>{errors.ownerEmail && <p id="edit-owner-email-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{errors.ownerEmail}</p>}</div></section>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 p-5 sm:flex-row sm:justify-end"><Link href={`/platform/companies/${company.id}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">Cancel</Link><button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60">{saving ? "Saving…" : "Save changes"}</button></div>
    </form>
  </div>;
}
