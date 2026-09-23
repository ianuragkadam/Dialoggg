"use client";

import { useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_CHARACTERS, passwordByteLength } from "@/lib/password-policy";
import PasswordField from "@/components/PasswordField";

export default function ChangePasswordForm() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < MIN_PASSWORD_CHARACTERS) return setMsg({ ok: false, text: `Use at least ${MIN_PASSWORD_CHARACTERS} characters for your password.` });
    if (passwordByteLength(next) > MAX_PASSWORD_BYTES) return setMsg({ ok: false, text: `Use no more than ${MAX_PASSWORD_BYTES} UTF-8 bytes for your password.` });
    setMsg(null); setSaving(true);
    const r = await authenticatedFetch("/api/account/password", {
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

  return (
    <form onSubmit={submit} className="bg-white border rounded shadow-sm p-6 space-y-3 max-w-md">
      <h2 className="font-semibold">Change Password</h2>
      <PasswordField id="current-password" label="Current Password" required autoComplete="current-password" value={cur} onChange={setCur} />
      <PasswordField id="new-password" label="New Password" required autoComplete="new-password" value={next} onChange={setNext} placeholder={`${MIN_PASSWORD_CHARACTERS}–${MAX_PASSWORD_BYTES} UTF-8 bytes`} />
      {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</div>}
      <button type="submit" disabled={saving} className="bg-blue-700 text-white px-5 py-2 rounded font-semibold hover:bg-blue-800 disabled:opacity-60">
        {saving ? "Saving…" : "Update Password"}
      </button>
    </form>
  );
}
