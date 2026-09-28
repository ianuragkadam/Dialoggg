"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthCard } from "@/components/ForgotPasswordForm";
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_CHARACTERS, passwordByteLength } from "@/lib/password-policy";
import PasswordField from "@/components/PasswordField";

export default function PasswordTokenForm({ mode }: { mode: "reset" | "invitation" }) {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    setToken(value);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return setMessage(`This ${mode === "reset" ? "reset" : "invitation"} link is invalid or expired.`);
    if (password.length < MIN_PASSWORD_CHARACTERS) return setMessage(`Use at least ${MIN_PASSWORD_CHARACTERS} characters for your password.`);
    if (passwordByteLength(password) > MAX_PASSWORD_BYTES) return setMessage(`Use no more than ${MAX_PASSWORD_BYTES} UTF-8 bytes for your password.`);
    if (password !== confirm) return setMessage("The passwords do not match.");
    setBusy(true);
    const endpoint = mode === "reset" ? "/api/v1/auth/reset-password" : "/api/v1/invitations/accept";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage(result.error?.message || "This link is invalid or expired.");
    setToken("");
    setPassword("");
    setConfirm("");
    setCompleted(true);
    setMessage(mode === "reset" ? "Your password has been reset." : "Your invitation has been accepted.");
  }

  const title = mode === "reset" ? "Reset password" : "Accept invitation";
  const description = mode === "reset" ? "Choose a new password for your Dialoggg identity." : "New users create a password; existing users confirm their current Dialoggg password.";
  return <AuthCard title={title} description={description}>
    {completed ? <div className="space-y-4"><p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-950">{message}</p><Link href={mode === "invitation" ? "/projects" : "/login"} className="block rounded bg-blue-700 py-2 text-center font-semibold text-white">Continue</Link></div> :
      <form onSubmit={submit} className="space-y-4">
        <div><PasswordField id={`${mode}-password`} label={mode === "reset" ? "New password" : "Password"} required minLength={MIN_PASSWORD_CHARACTERS} autoComplete={mode === "reset" ? "new-password" : "current-password"} value={password} onChange={setPassword} /><p className="mt-1 text-xs text-gray-500">At least {MIN_PASSWORD_CHARACTERS} characters and no more than {MAX_PASSWORD_BYTES} UTF-8 bytes.</p></div>
        <PasswordField id={`${mode}-confirm`} label="Confirm password" required minLength={MIN_PASSWORD_CHARACTERS} autoComplete={mode === "reset" ? "new-password" : "current-password"} value={confirm} onChange={setConfirm} />
        {message && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{message}</p>}
        <button disabled={busy} className="w-full rounded bg-blue-700 py-2 font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : mode === "reset" ? "Reset password" : "Accept invitation"}</button>
        <Link href="/login" className="block text-center text-sm font-semibold text-blue-700 hover:underline">Return to login</Link>
      </form>}
  </AuthCard>;
}
