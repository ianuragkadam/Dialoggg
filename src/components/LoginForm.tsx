"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import PasswordField from "@/components/PasswordField";
import dialogggLogo from "../../Dialoggg-Google-logo.png";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-700 to-blue-900 p-6">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          <Image src={dialogggLogo} alt="Dialoggg logo" width={56} height={56} priority className="mx-auto h-14 w-14 rounded-xl object-contain" />
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
      </div>
    </div>
  );
}
