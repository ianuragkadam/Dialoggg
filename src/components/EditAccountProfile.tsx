"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "@/lib/client-fetch";

type ProfileDraft = { firstName: string; lastName: string; email: string };
type ApiPayload = { data?: { status?: string; email?: string }; error?: { code?: string; message?: string; fields?: Record<string, string> } };

export default function EditAccountProfile({ initialProfile }: { initialProfile: ProfileDraft }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"edit" | "verify">("edit");
  const [draft, setDraft] = useState(initialProfile);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  function beginEdit() {
    setDraft(initialProfile);
    setCode("");
    setMessage("");
    setNotice("");
    setFieldErrors({});
    setStage("edit");
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setMessage("");
    setFieldErrors({});
  }

  function validateDraft() {
    const errors: Record<string, string> = {};
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    const email = draft.email.trim();
    if (!firstName) errors.firstName = "First name is required.";
    else if (firstName.length > 80) errors.firstName = "Use no more than 80 characters.";
    if (lastName.length > 80) errors.lastName = "Use no more than 80 characters.";
    if (email.length > 254 || !/^\S+@\S+\.\S{2,}$/u.test(email) || email.includes("..")) errors.email = "Enter a valid email address.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitProfile(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setMessage("");
    setNotice("");
    if (!validateDraft()) return;
    setBusy(true);
    try {
      const response = await authenticatedFetch("/api/account/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), email: draft.email.trim() }),
      });
      const payload = await response.json().catch(() => ({})) as ApiPayload;
      if (!response.ok) {
        setMessage(payload.error?.message || "Your profile could not be saved. Please try again.");
        setFieldErrors(payload.error?.fields || {});
        return;
      }
      if (payload.data?.status === "verification_required") {
        setStage("verify");
        setCode("");
        setNotice(`We sent an 8-digit verification code to ${payload.data.email || draft.email.trim()}. Your current email stays active until verification succeeds.`);
        return;
      }
      setNotice("Your profile was updated.");
      setOpen(false);
      router.refresh();
    } catch {
      setMessage("We could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setFieldErrors({});
    const normalizedCode = code.replace(/\s/g, "");
    if (!/^\d{8}$/.test(normalizedCode)) {
      setFieldErrors({ code: "Enter the 8-digit code from your email." });
      return;
    }
    setBusy(true);
    try {
      const response = await authenticatedFetch("/api/account/profile/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: draft.email.trim(), code: normalizedCode }),
      });
      const payload = await response.json().catch(() => ({})) as ApiPayload;
      if (!response.ok) {
        setMessage(payload.error?.message || "The email address could not be verified.");
        setFieldErrors(payload.error?.fields || {});
        return;
      }
      setOpen(false);
      setNotice("Your email address was verified and updated.");
      router.refresh();
    } catch {
      setMessage("We could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" onClick={beginEdit} className="rounded border border-blue-300 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">
      Edit
    </button>
    {notice && !open && <p role="status" className="sr-only">{notice}</p>}
    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-4" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="edit-profile-title" className="my-auto w-full max-w-lg rounded-lg border border-blue-200 bg-white p-6 text-gray-900 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="edit-profile-title" className="text-xl font-bold">{stage === "edit" ? "Edit account information" : "Verify your new email"}</h2>
            <p className="mt-1 text-sm text-gray-600">{stage === "edit" ? "You can update your name immediately. Email changes require verification." : "Enter the code sent to the new address. Your existing email remains active until the code is confirmed."}</p>
          </div>
          <button type="button" onClick={close} disabled={busy} aria-label="Close" className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50">✕</button>
        </div>

        {stage === "edit" ? <form onSubmit={submitProfile} className="mt-5 space-y-4" noValidate>
          <label className="block text-sm font-semibold">First name
            <input autoComplete="given-name" maxLength={80} value={draft.firstName} onChange={event => setDraft(current => ({ ...current, firstName: event.target.value }))} aria-invalid={!!fieldErrors.firstName} aria-describedby={fieldErrors.firstName ? "profile-first-error" : undefined} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 font-normal" />
            {fieldErrors.firstName && <span id="profile-first-error" className="mt-1 block text-sm text-red-700">{fieldErrors.firstName}</span>}
          </label>
          <label className="block text-sm font-semibold">Last name <span className="font-normal text-gray-500">(optional)</span>
            <input autoComplete="family-name" maxLength={80} value={draft.lastName} onChange={event => setDraft(current => ({ ...current, lastName: event.target.value }))} aria-invalid={!!fieldErrors.lastName} aria-describedby={fieldErrors.lastName ? "profile-last-error" : undefined} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 font-normal" />
            {fieldErrors.lastName && <span id="profile-last-error" className="mt-1 block text-sm text-red-700">{fieldErrors.lastName}</span>}
          </label>
          <label className="block text-sm font-semibold">Email address
            <input type="email" autoComplete="email" maxLength={254} value={draft.email} onChange={event => setDraft(current => ({ ...current, email: event.target.value }))} aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "profile-email-error" : "profile-email-help"} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 font-normal" />
            <span id="profile-email-help" className="mt-1 block font-normal text-gray-600">If changed, we’ll send a one-time code to the new email.</span>
            {fieldErrors.email && <span id="profile-email-error" className="mt-1 block text-sm text-red-700">{fieldErrors.email}</span>}
          </label>
          {message && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{message}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={close} disabled={busy} className="rounded border border-gray-300 px-4 py-2 font-semibold disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy} className="rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </form> : <form onSubmit={verifyEmail} className="mt-5 space-y-4" noValidate>
          {notice && <p role="status" className="rounded bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
          <label className="block text-sm font-semibold">8-digit verification code
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} aria-invalid={!!fieldErrors.code} aria-describedby={fieldErrors.code ? "profile-code-error" : undefined} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 font-normal tracking-[0.3em]" />
            {fieldErrors.code && <span id="profile-code-error" className="mt-1 block text-sm text-red-700">{fieldErrors.code}</span>}
          </label>
          {message && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{message}</p>}
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <button type="button" onClick={() => { setStage("edit"); setMessage(""); setFieldErrors({}); }} disabled={busy} className="rounded border border-gray-300 px-4 py-2 font-semibold disabled:opacity-50">Back</button>
            <div className="flex gap-2">
              <button type="button" onClick={() => void submitProfile()} disabled={busy} className="rounded border border-gray-300 px-4 py-2 font-semibold disabled:opacity-50">{busy ? "Sending…" : "Resend code"}</button>
              <button type="submit" disabled={busy} className="rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{busy ? "Verifying…" : "Verify email"}</button>
            </div>
          </div>
        </form>}
      </section>
    </div>}
  </>;
}
