"use client";

import { useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";

export default function CompanyAutoCompletionSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function change(next: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const response = await authenticatedFetch("/api/v1/company/auto-completion", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: next }),
      });
      if (!response.ok) throw new Error("The setting could not be saved.");
      setEnabled(next);
      setMessage(`Auto Completion is ${next ? "On" : "Off"}. Open Project Plans must refresh before editing.`);
    } catch { setMessage("The setting could not be saved. Try again."); }
    finally { setBusy(false); }
  }

  return <section className="rounded border border-blue-200 bg-white p-6 shadow-sm" aria-labelledby="auto-completion-title">
    <div className="flex items-start justify-between gap-4">
      <div><h2 id="auto-completion-title" className="font-semibold">Auto Completion</h2>
        <p className="mt-1 text-sm text-gray-600">Automatically update Task progress after each scheduled working day. A manually set Task stays manual until Reset to Auto is selected.</p></div>
      <label className="flex shrink-0 items-center gap-2 text-sm font-semibold"><input type="checkbox" role="switch" checked={enabled} disabled={busy} onChange={event => void change(event.target.checked)} />{enabled ? "On" : "Off"}</label>
    </div>
    {message && <p role="status" className="mt-2 text-sm text-blue-800">{message}</p>}
  </section>;
}
