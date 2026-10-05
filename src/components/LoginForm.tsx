"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import PasswordField from "@/components/PasswordField";
import dialogggLogo from "../../dialoggg-lockup-transparent-onDark.png";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestAccessOpen, setRequestAccessOpen] = useState(false);
  const [requestAccessName, setRequestAccessName] = useState("");
  const [requestAccessEmail, setRequestAccessEmail] = useState("");
  const [requestAccessMessage, setRequestAccessMessage] = useState("");
  const [requestAccessError, setRequestAccessError] = useState("");
  const [requestAccessSuccess, setRequestAccessSuccess] = useState("");
  const [requestAccessLoading, setRequestAccessLoading] = useState(false);

  async function submitAccessRequest(event: React.FormEvent) {
    event.preventDefault();
    setRequestAccessError("");
    setRequestAccessSuccess("");
    setRequestAccessLoading(true);
    try {
      const response = await fetch("/api/auth/access-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: requestAccessName, email: requestAccessEmail, message: requestAccessMessage }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRequestAccessError(response.status === 429
          ? "Too many requests. Please wait a while and try again."
          : result.error?.message || "We couldn’t submit your request. Please try again.");
        return;
      }
      setRequestAccessSuccess("Your access request has been submitted. The Dialoggg team will follow up by email.");
      setRequestAccessName("");
      setRequestAccessEmail("");
      setRequestAccessMessage("");
    } catch {
      setRequestAccessError("We couldn’t reach Dialoggg. Check your connection and try again.");
    } finally {
      setRequestAccessLoading(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        window.location.assign(result.user?.user_type === "super_admin" ? "/platform/companies" : "/projects");
        return;
      }

      setError(
        response.status === 429
          ? result.error || "Too many login attempts. Please wait a moment and try again."
          : "Email or password is incorrect. Check your details and try again.",
      );
    } catch {
      setError("We couldn’t reach Dialoggg. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#D1850B" }}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          <div className="mx-auto inline-flex rounded-lg bg-slate-950 px-4 py-2">
            <Image src={dialogggLogo} alt="Dialoggg" width={190} height={42} priority className="h-10 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-bold mt-3 text-blue-800">Log in to Dialoggg</h1>
          <p className="mt-1 text-sm text-gray-500">Open your company Projects and schedules.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium mb-1">Email</label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={event => { setEmail(event.target.value); setError(""); }}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <PasswordField id="login-password" label="Password" required autoComplete="current-password" value={password} onChange={value => { setPassword(value); setError(""); }} className="w-full rounded border px-3 py-2 pr-11 outline-none focus:ring-2 focus:ring-blue-500" />
          {error && (
            <div role="alert" aria-live="polite" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? "Logging in…" : "Log In"}
          </button>
          <Link href="/forgot-password" className="block text-center text-sm font-semibold text-blue-700 hover:underline">Forgot password?</Link>
        </form>
        <div className="mt-4 border-t border-slate-200 pt-4">
          <button type="button" aria-expanded={requestAccessOpen} aria-controls="request-access-form" onClick={() => { setRequestAccessOpen(open => !open); setRequestAccessError(""); setRequestAccessSuccess(""); }} className="w-full rounded py-2 text-sm font-semibold text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500">
            No Account? Request Access
          </button>
          {requestAccessOpen && <form id="request-access-form" onSubmit={submitAccessRequest} className="mt-3 space-y-3" noValidate>
            <p className="text-sm text-gray-600">Send an access request to the Dialoggg team.</p>
            <div>
              <label htmlFor="access-request-name" className="mb-1 block text-sm font-medium">Name</label>
              <input id="access-request-name" type="text" required maxLength={100} autoComplete="name" value={requestAccessName} onChange={event => setRequestAccessName(event.target.value)} className="w-full rounded border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="access-request-email" className="mb-1 block text-sm font-medium">Email</label>
              <input id="access-request-email" type="email" required maxLength={254} autoComplete="email" value={requestAccessEmail} onChange={event => setRequestAccessEmail(event.target.value)} className="w-full rounded border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="access-request-message" className="mb-1 block text-sm font-medium">Request details</label>
              <textarea id="access-request-message" required maxLength={1000} rows={3} value={requestAccessMessage} onChange={event => setRequestAccessMessage(event.target.value)} className="w-full resize-y rounded border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="mt-1 text-right text-xs text-gray-500">{requestAccessMessage.length}/1000</p>
            </div>
            {requestAccessError && <p role="alert" aria-live="polite" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{requestAccessError}</p>}
            {requestAccessSuccess && <p role="status" aria-live="polite" className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{requestAccessSuccess}</p>}
            <button type="submit" disabled={requestAccessLoading} className="w-full rounded bg-blue-700 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{requestAccessLoading ? "Sending…" : "Send Access Request"}</button>
          </form>}
        </div>
      </div>
    </div>
  );
}
