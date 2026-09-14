"use client";

import { useState } from "react";

export default function ChangePasswordForm() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setSaving(true);
    const r = await fetch("/api/account/password", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ current_password: cur, new_password: next }),
    });
    setSaving(false);
    if (r.ok) {
      setMsg({ ok: true, text: "Password changed." });
      setCur(""); setNext("");
    } else {
      setMsg({ ok: false, text: (await r.json().catch(() => ({}))).error || "Failed" });
    }
  }

  const field = "w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <form onSubmit={submit} className="bg-white border rounded shadow-sm p-6 space-y-3 max-w-md">
      <h2 className="font-semibold">Change Password</h2>
      <div>
        <label className="block text-sm font-medium mb-1">Current Password</label>
        <input type="password" value={cur} onChange={e => setCur(e.target.value)} className={field} required />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">New Password</label>
        <input type="password" value={next} onChange={e => setNext(e.target.value)} className={field} placeholder="At least 6 characters" required />
      </div>
      {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</div>}
      <button type="submit" disabled={saving} className="bg-blue-700 text-white px-5 py-2 rounded font-semibold hover:bg-blue-800 disabled:opacity-60">
        {saving ? "Saving…" : "Update Password"}
      </button>
    </form>
  );
}
