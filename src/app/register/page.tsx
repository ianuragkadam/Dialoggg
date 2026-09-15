"use client";

import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [form, setForm] = useState({ company_name: "", full_name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (res.ok) {
      // Registration creates the session and changes the authenticated shell.
      // A full navigation avoids leaving the unauthenticated form mounted while
      // the new server-rendered session state is being resolved.
      window.location.assign("/projects");
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Sign up failed");
    }
  }

  const field = "w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-700 to-blue-900 p-6">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded bg-gradient-to-br from-blue-600 to-blue-800 text-white font-bold flex items-center justify-center text-2xl">D</div>
          <h1 className="text-2xl font-bold mt-3 text-blue-800">Create your company</h1>
          <p className="text-sm text-gray-500">Set up Dialoggg for your business in one step.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Company Name</label>
            <input required value={form.company_name} onChange={e => set("company_name", e.target.value)} className={field} placeholder="Company name" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Your Name</label>
            <input value={form.full_name} onChange={e => set("full_name", e.target.value)} className={field} placeholder="e.g. Scott Grote" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" required value={form.email} onChange={e => set("email", e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input type="password" required value={form.password} onChange={e => set("password", e.target.value)} className={field} placeholder="At least 6 characters" />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button type="submit" disabled={loading} className="w-full py-2 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800 disabled:opacity-60">
            {loading ? "Creating…" : "Create Company"}
          </button>
          <div className="text-center text-sm text-gray-500 pt-2">
            Already have an account? <Link href="/login" className="text-blue-700 font-semibold">Log in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
