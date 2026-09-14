"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewProjectPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", client_name: "", client_email: "",
    address: "", city: "", state: "", zip: "", phone: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "", note: "",
  });

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const j = await res.json();
      router.push(`/projects/${j.id}`);
    } else {
      alert("Save failed");
      setSaving(false);
    }
  }

  const field = "w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/projects" className="hover:text-blue-700">Projects</Link>
        <span>›</span>
        <span className="text-gray-800">New Project</span>
      </div>
      <h1 className="text-2xl font-bold mb-6">Add Project</h1>

      <form onSubmit={submit} className="bg-white p-6 rounded shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Project Name *</label>
          <input required value={form.name} onChange={e => set("name", e.target.value)} className={field} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Client Name</label>
            <input value={form.client_name} onChange={e => set("client_name", e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Client Email</label>
            <input type="email" value={form.client_email} onChange={e => set("client_email", e.target.value)} className={field} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Address</label>
          <input value={form.address} onChange={e => set("address", e.target.value)} className={field} />
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">City</label>
            <input value={form.city} onChange={e => set("city", e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">State</label>
            <input value={form.state} onChange={e => set("state", e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Zip</label>
            <input value={form.zip} onChange={e => set("zip", e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input value={form.phone} onChange={e => set("phone", e.target.value)} className={field} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Date *</label>
            <input type="date" required value={form.start_date} onChange={e => set("start_date", e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} className={field} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea value={form.note} onChange={e => set("note", e.target.value)} className={field} rows={3} />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800 disabled:opacity-60">
            {saving ? "Saving…" : "Save Project"}
          </button>
          <Link href="/projects" className="px-5 py-2 bg-gray-200 rounded font-semibold hover:bg-gray-300">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
