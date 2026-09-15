"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (response.ok) {
      window.location.assign(result.user?.user_type === "super_admin" ? "/platform/companies" : "/projects");
      return;
    }
    setError(result.error || "Login failed");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-700 to-blue-900 p-6">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded bg-gradient-to-br from-blue-600 to-blue-800 text-white font-bold flex items-center justify-center text-2xl">D</div>
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
              onChange={event => setEmail(event.target.value)}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium mb-1">Password</label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          {error && <div role="alert" className="text-red-600 text-sm">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? "Logging in…" : "Log In"}
          </button>
          <div className="text-center text-sm text-gray-500 pt-2">
            New here? <Link href="/register" className="text-blue-700 font-semibold">Create your company</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
