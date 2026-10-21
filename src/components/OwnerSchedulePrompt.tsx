"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";

export default function OwnerSchedulePrompt() {
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/me/owner-schedule", { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(payload => { if (active) setShow(payload?.data?.show === true); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function answer(value: "yes" | "not_now") {
    setSaving(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/v1/me/owner-schedule", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: value }),
      });
      if (!response.ok) throw new Error();
      setShow(false);
      window.location.reload();
    } catch {
      setError("Could not save your choice. Please try again.");
    } finally { setSaving(false); }
  }

  if (!show) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="owner-schedule-title" className="w-full max-w-lg rounded-xl border border-slate-600 bg-[#14243a] p-6 text-white shadow-2xl">
      <h2 id="owner-schedule-title" className="text-xl font-bold">Will you be assigned to tasks yourself?</h2>
      <p className="mt-3 text-sm leading-6 text-slate-200">Your login lets you run the account. To put yourself on the schedule, you also need to be a resource.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" disabled={saving} onClick={() => void answer("not_now")} className="min-h-11 rounded-lg border border-slate-500 px-4 font-semibold text-white disabled:opacity-50">Not now</button>
        <button type="button" disabled={saving} onClick={() => void answer("yes")} className="min-h-11 rounded-lg bg-amber-500 px-4 font-bold text-slate-950 disabled:opacity-50">Yes, add me as a resource</button>
      </div>
    </section>
  </div>;
}
