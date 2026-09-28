"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { roleLabel } from "@/lib/product-language";
import { authenticatedFetch } from "@/lib/client-fetch";

type User = { id: number; email: string; full_name: string | null; user_type: string };
type AuthContext = {
  type: "platform" | "company";
  companyId: number | null;
  companyName: string | null;
  membershipId: number | null;
  role: string;
  actualRole?: string;
  rolePreview?: boolean;
};

const MENU = [
  { label: "Companies",          href: "/platform/companies",  icon: "🏢", adminOnly: false, platformOnly: true, tenantOnly: false },
  { label: "My Company",         href: "/projects",            icon: "📁", adminOnly: false, platformOnly: false, tenantOnly: true },
  { label: "My Projects",        href: "/projects/mine",       icon: "📂", adminOnly: false, platformOnly: false, tenantOnly: true },
  { label: "Master Calendar",    href: "/calendar",            icon: "📅", adminOnly: false, platformOnly: false, tenantOnly: true },
  { label: "Resource Calendar",  href: "/resources/schedule",  icon: "👥", adminOnly: false, platformOnly: false, tenantOnly: true },
  { label: "Resources",          href: "/resources",           icon: "👤", adminOnly: false, platformOnly: false, tenantOnly: true },
  { label: "Users",              href: "/users",               icon: "🧑‍💼", adminOnly: true, platformOnly: false, tenantOnly: true },
  { label: "Project Types",      href: "/settings/project-types", icon: "🏷️", adminOnly: true, platformOnly: false, tenantOnly: true },
  { label: "Project Templates",  href: "/templates",           icon: "📋", adminOnly: true, platformOnly: false, tenantOnly: true },
  { label: "Microsoft Storage",  href: "/settings/microsoft-storage", icon: "☁️", adminOnly: true, platformOnly: false, tenantOnly: true },
  { label: "Account",            href: "/account",             icon: "⚙️", adminOnly: false, platformOnly: false, tenantOnly: false },
  { label: "Help",               href: "/help",                icon: "❓", adminOnly: false, platformOnly: false, tenantOnly: false },
];

export default function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contexts, setContexts] = useState<AuthContext[]>([]);
  const [activeContext, setActiveContext] = useState("");
  const [switchingContext, setSwitchingContext] = useState(false);
  const [actualRole, setActualRole] = useState(user.user_type);
  const [previewRole, setPreviewRole] = useState(user.user_type);
  const [rolePreviewEnabled, setRolePreviewEnabled] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const platformAdmin = user.user_type === "super_admin";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/me", { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(payload => {
        if (cancelled || !payload?.data) return;
        const available = payload.data.contexts as AuthContext[];
        const active = payload.data.activeContext as AuthContext;
        setContexts(available);
        setActiveContext(active.type === "platform" ? "platform" : `company:${active.membershipId}`);
        setActualRole(active.actualRole || active.role);
        setPreviewRole(active.role);
        setRolePreviewEnabled(!!active.rolePreview);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [user.id, user.user_type]);

  useEffect(() => { setOpen(false); }, [pathname]);

  async function switchContext(value: string) {
    if (!value || value === activeContext) return;
    setSwitchingContext(true);
    const isPlatform = value === "platform";
    const membershipId = isPlatform ? null : Number(value.split(":")[1]);
    try {
      const response = await authenticatedFetch("/api/v1/me/active-company", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: isPlatform ? "platform" : "company", membershipId }),
      });
      if (!response.ok) throw new Error("Context switch failed");
      setActiveContext(value);
      window.location.assign(isPlatform ? "/platform/companies" : "/projects");
    } finally {
      setSwitchingContext(false);
    }
  }

  async function switchRole(role: string) {
    if (!role || role === previewRole || switchingRole) return;
    setSwitchingRole(true);
    try {
      const response = await authenticatedFetch("/api/v1/me/role-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error("Role preview could not be changed");
      window.location.reload();
    } finally {
      setSwitchingRole(false);
    }
  }

  async function logout() {
    await authenticatedFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="relative z-50 flex-none bg-blue-800 text-white shadow-md">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setOpen(current => !current)} aria-controls="primary-navigation" aria-expanded={open} aria-label={open ? "Close navigation" : "Open navigation"} className="rounded p-1 text-2xl focus:outline-none focus:ring-2 focus:ring-white lg:hidden">☰</button>
            <div className="w-9 h-9 rounded bg-white text-blue-800 font-bold flex items-center justify-center">D</div>
            <div>
              <div className="font-bold text-lg leading-tight">Dialoggg</div>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            {contexts.length > 1 && <div><label htmlFor="active-company-context" className="sr-only">Active company context</label><select id="active-company-context" value={activeContext} disabled={switchingContext} onChange={event => switchContext(event.target.value)} className="w-32 max-w-32 rounded border border-blue-500 bg-blue-900 px-2 py-1.5 text-xs font-semibold text-white outline-none focus:ring-2 focus:ring-white disabled:opacity-60 sm:w-auto sm:max-w-52"><option value="" disabled>Choose context</option>{contexts.map(context => <option key={context.type === "platform" ? "platform" : `company:${context.membershipId}`} value={context.type === "platform" ? "platform" : `company:${context.membershipId}`}>{context.type === "platform" ? "Platform Administration" : `${context.companyName} · ${context.role}`}</option>)}</select></div>}
            <span className="hidden truncate text-sm text-blue-100 sm:inline">{user.full_name || user.email}</span>
            {actualRole === "owner" && activeContext.startsWith("company:") ? (
              <div className="flex items-center gap-1">
                <label htmlFor="role-preview" className="sr-only">Preview company role</label>
                <select
                  id="role-preview"
                  aria-label="Preview company role"
                  value={previewRole}
                  disabled={switchingRole}
                  onChange={event => switchRole(event.target.value)}
                  className="max-w-36 rounded border border-blue-500 bg-blue-900 px-2 py-1.5 text-xs font-semibold text-white outline-none focus:ring-2 focus:ring-white disabled:opacity-60 sm:max-w-48"
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="employee">Employee</option>
                  <option value="external">External</option>
                </select>
                {rolePreviewEnabled && <span className="hidden rounded bg-amber-300 px-2 py-1 text-xs font-semibold text-amber-950 md:inline">Read-only preview</span>}
              </div>
            ) : (
              <span className="hidden whitespace-nowrap rounded bg-blue-700 px-2 py-1 text-xs sm:inline">{roleLabel(user.user_type)}</span>
            )}
            <button onClick={logout} className="whitespace-nowrap rounded bg-blue-700 px-3 py-1 text-sm hover:bg-blue-900">
              Log out
            </button>
          </div>
        </div>
      </header>

      {rolePreviewEnabled && <div className="relative z-40 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow">Viewing as {roleLabel(previewRole)}. Changes are disabled during role preview. Select Owner to exit.</div>}
      <div className="flex flex-1">
        {open && <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" />}
        <aside className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] flex-none transform overflow-y-auto border-r bg-white pt-16 shadow-xl transition-transform lg:static lg:z-auto lg:w-56 lg:max-w-none lg:translate-x-0 lg:pt-0 lg:shadow-none ${open ? "translate-x-0" : "-translate-x-full"}`}>
          <nav id="primary-navigation" className="space-y-1 p-2" aria-label="Primary navigation">
            {MENU.filter(m => {
              if (m.platformOnly) return platformAdmin;
              if (platformAdmin && m.tenantOnly) return false;
              if (user.user_type === "external" && ["My Projects", "Master Calendar", "Resource Calendar", "Resources"].includes(m.label)) return false;
              return !m.adminOnly || user.user_type === "admin" || user.user_type === "owner";
            }).map(m => {
              const active = pathname === m.href || (m.href !== "/" && pathname.startsWith(m.href));
              return (
                <Link
                  key={m.href} href={m.href} onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
                    active ? "bg-blue-100 text-blue-800 font-semibold" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span className="text-lg">{m.icon}</span>
                  <span>{m.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto bg-gray-50 p-3 sm:p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
