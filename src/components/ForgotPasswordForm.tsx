"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/v1/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(response.ok
      ? result.data?.message || "If an eligible account exists, a password-reset email will be sent."
      : result.error?.message || "Unable to process the request. Try again later.");
  }

  return <AuthCard title="Forgot password" description="Enter your login email. The response is the same whether or not an account exists." orangeBackground>
    <form onSubmit={submit} className="space-y-4">
      <div><label htmlFor="forgot-email" className="mb-1 block text-sm font-medium">Email</label><input id="forgot-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></div>
      {message && <p role="status" className="rounded bg-blue-50 p-3 text-sm text-blue-950">{message}</p>}
      <button disabled={busy} className="w-full rounded bg-blue-700 py-2 font-semibold text-white disabled:opacity-60">{busy ? "Sending…" : "Send reset link"}</button>
      <Link href="/login" className="block text-center text-sm font-semibold text-blue-700 hover:underline">Return to login</Link>
    </form>
  </AuthCard>;
}

export function AuthCard({ title, description, children, orangeBackground = false }: { title: string; description: string; children: React.ReactNode; orangeBackground?: boolean }) {
  return <main className="flex min-h-screen items-center justify-center p-6" style={orangeBackground ? { backgroundColor: "#D1850B" } : { background: "linear-gradient(to bottom right, #1d4ed8, #1e3a8a)" }}>
    <section className="w-full max-w-md rounded-lg bg-white p-8 shadow-xl" aria-labelledby="auth-title">
      <div className="mb-6 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded bg-gradient-to-br from-blue-600 to-blue-800 text-2xl font-bold text-white">D</div><h1 id="auth-title" className="mt-3 text-2xl font-bold text-blue-800">{title}</h1><p className="mt-1 text-sm text-gray-600">{description}</p></div>
      {children}
    </section>
  </main>;
}
