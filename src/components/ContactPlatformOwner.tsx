"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";
import TimedNotice from "@/components/TimedNotice";

export default function ContactPlatformOwner() {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", onKeyDown); };
  }, [open, busy]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const response = await authenticatedFetch("/api/account/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Your message could not be submitted. Please try again.");
      setSubject("");
      setMessage("");
      setOpen(false);
      setSuccess("Your message was submitted to the Platform Owner.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your message could not be submitted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex flex-col items-end">
    <button type="button" onClick={() => { setError(""); setOpen(true); }} className="min-h-10 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700">Contact</button>
    {(success || error) && <div className="fixed bottom-5 right-5 z-[70] w-[min(28rem,calc(100vw-2.5rem))]"><TimedNotice message={success || error} tone={error ? "error" : "success"} onDismiss={() => { setSuccess(""); setError(""); }} /></div>}
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={() => { if (!busy) setOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="contact-platform-owner-title" className="w-full max-w-lg rounded-xl bg-white p-6 text-slate-900 shadow-2xl" onMouseDown={event => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><h2 id="contact-platform-owner-title" className="text-xl font-bold">Contact the Platform Owner</h2><button type="button" aria-label="Close contact form" disabled={busy} onClick={() => setOpen(false)} className="rounded px-2 text-xl">×</button></div><p className="mt-2 text-sm text-slate-600">Send a message to the Dialoggg Platform Owner.</p><form onSubmit={submit} className="mt-5 space-y-4"><div><label htmlFor="contact-subject" className="block text-sm font-bold">Subject</label><input id="contact-subject" autoFocus required maxLength={150} value={subject} onChange={event => setSubject(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></div><div><label htmlFor="contact-message" className="block text-sm font-bold">Message</label><textarea id="contact-message" required minLength={10} maxLength={5000} rows={6} value={message} onChange={event => setMessage(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3" /></div><div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-bold">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Sending…" : "Send message"}</button></div></form></section></div>}
  </div>;
}
