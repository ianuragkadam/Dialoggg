"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/useMe";
import SubscribeButton from "@/components/SubscribeButton";

type Resource = { id: number; name: string; email: string | null; phone: string | null; category: string | null };
type Category = { id: number; name: string };

export default function ResourcesPage() {
  const { canEdit } = useMe();
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category_name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const j = await fetch("/api/resources").then(r => r.json());
    setResources(j.resources || []);
    setCategories(j.categories || []);
  }
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch("/api/resources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setForm({ name: "", category_name: "", email: "", phone: "" });
    setShowForm(false);
    load();
  }

  const field = "w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Resources</h1>
        {canEdit && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-700 text-white px-4 py-2 rounded font-semibold hover:bg-blue-800"
          >
            {showForm ? "Cancel" : "+ Add Resource"}
          </button>
        )}
      </div>
      <p className="text-sm text-gray-600">
        The people and companies who do the work — employees, subcontractors, and suppliers.
        You assign them to tasks in each project's plan.
      </p>

      {showForm && (
        <form onSubmit={save} className="bg-white border rounded shadow-sm p-5 space-y-3 max-w-2xl">
          <h2 className="font-semibold">New Resource</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={field} placeholder="e.g. ACME Concrete" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <input
                value={form.category_name}
                onChange={e => setForm({ ...form, category_name: e.target.value })}
                className={field}
                placeholder="e.g. Subcontractors"
                list="cat-list"
              />
              <datalist id="cat-list">
                {categories.map(c => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={field} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={field} />
            </div>
          </div>
          <button type="submit" disabled={saving} className="bg-blue-700 text-white px-5 py-2 rounded font-semibold hover:bg-blue-800 disabled:opacity-60">
            {saving ? "Saving…" : "Save Resource"}
          </button>
        </form>
      )}

      {resources.length === 0 ? (
        <div className="bg-white border rounded shadow-sm p-12 text-center text-gray-500">
          No resources yet. Click <strong>+ Add Resource</strong> to add your first employee, sub, or supplier.
        </div>
      ) : (
        <div className="bg-white rounded shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-100"><tr>
              <th className="text-left px-4 py-3 text-sm font-semibold">Name</th>
              <th className="text-left px-4 py-3 text-sm font-semibold">Category</th>
              <th className="text-left px-4 py-3 text-sm font-semibold">Email</th>
              <th className="text-left px-4 py-3 text-sm font-semibold">Phone</th>
              {canEdit && <th className="text-left px-4 py-3 text-sm font-semibold">Personal Calendar</th>}
            </tr></thead>
            <tbody>
              {resources.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-sm">{r.category || "—"}</td>
                  <td className="px-4 py-3 text-sm">{r.email || "—"}</td>
                  <td className="px-4 py-3 text-sm">{r.phone || "—"}</td>
                  {canEdit && (
                    <td className="px-4 py-3 text-sm">
                      <SubscribeButton
                        feedUrlEndpoint={`/api/resources/${r.id}/feed-url`}
                        label="📅 Get their link"
                        compact
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
