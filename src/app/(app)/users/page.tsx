"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/useMe";
import { roleLabel } from "@/lib/product-language";

type U = { id: number; email: string; full_name: string | null; user_type: string };

export default function UsersPage() {
  const { me, canEdit, loading } = useMe();
  const [users, setUsers] = useState<U[]>([]);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "viewer" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/users");
    if (r.ok) setUsers((await r.json()).users || []);
  }
  useEffect(() => { if (canEdit) load(); }, [canEdit]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSaving(true);
    const r = await fetch("/api/users", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (r.ok) {
      setForm({ full_name: "", email: "", password: "", role: "viewer" });
      load();
    } else {
      setError((await r.json().catch(() => ({}))).error || "Failed to add user");
    }
  }

  async function changeRole(id: number, role: string) {
    await fetch(`/api/users/${id}`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    load();
  }

  async function removeUser(id: number) {
    if (!confirm("Remove this user?")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="text-gray-500">Loading…</div>;
  if (!canEdit) {
    return (
      <div className="bg-white border rounded shadow-sm p-12 text-center text-gray-500">
        Only Admins can manage Users.
      </div>
    );
  }

  const field = "w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold">Users</h1>
      <p className="text-sm text-gray-600">
        Admins can manage the current company. Employees have Internal, read-only access.
      </p>

      <form onSubmit={addUser} className="bg-white border rounded shadow-sm p-5 space-y-3">
        <h2 className="font-semibold">Add User</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Initial Password *</label>
            <input type="password" autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={field} placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={field}>
              <option value="viewer">{roleLabel("viewer")} (read-only)</option>
              <option value="admin">{roleLabel("admin")}</option>
            </select>
          </div>
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <button type="submit" disabled={saving} className="bg-blue-700 text-white px-5 py-2 rounded font-semibold hover:bg-blue-800 disabled:opacity-60">
          {saving ? "Adding…" : "Add User"}
        </button>
      </form>

      <div className="bg-white rounded shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-100"><tr>
            <th className="text-left px-4 py-3 text-sm font-semibold">Name</th>
            <th className="text-left px-4 py-3 text-sm font-semibold">Email</th>
            <th className="text-left px-4 py-3 text-sm font-semibold">Role</th>
            <th className="text-left px-4 py-3 text-sm font-semibold">Actions</th>
          </tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-3 font-medium">{u.full_name || "—"}{u.id === me?.id && <span className="text-xs text-gray-400"> (you)</span>}</td>
                <td className="px-4 py-3 text-sm">{u.email}</td>
                <td className="px-4 py-3 text-sm">
                  <select
                    value={u.user_type === "admin" ? "admin" : "viewer"}
                    onChange={e => changeRole(u.id, e.target.value)}
                    disabled={u.id === me?.id}
                    className="px-2 py-1 border rounded text-sm"
                  >
                    <option value="viewer">{roleLabel("viewer")}</option>
                    <option value="admin">{roleLabel("admin")}</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-sm">
                  {u.id !== me?.id && (
                    <button onClick={() => removeUser(u.id)} className="text-red-600 hover:underline">Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
