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
};

const MENU = [
  { label: "Companies",          href: "/platform/companies",  icon: "🏢", adminOnly: false, platformOnly: true, tenantOnly: false },
  { label: "All Projects",       href: "/projects",            icon: "📁", adminOnly: false, platformOnly: false, tenantOnly: true },
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
  const [open, setOpen] = useState(true);
  const [contexts, setContexts] = useState<AuthContext[]>([]);
  const [activeContext, setActiveContext] = useState("");
  const [switchingContext, setSwitchingContext] = useState(false);
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
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [user.id, user.user_type]);

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

  async function logout() {
    await authenticatedFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-blue-800 text-white shadow-md flex-none">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setOpen(!open)} className="lg:hidden text-2xl">☰</button>
            <div className="w-9 h-9 rounded bg-white text-blue-800 font-bold flex items-center justify-center">D</div>
            <div>
              <div className="font-bold text-lg leading-tight">Dialoggg</div>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            {contexts.length > 1 && <div><label htmlFor="active-company-context" className="sr-only">Active company context</label><select id="active-company-context" value={activeContext} disabled={switchingContext} onChange={event => switchContext(event.target.value)} className="w-32 max-w-32 rounded border border-blue-500 bg-blue-900 px-2 py-1.5 text-xs font-semibold text-white outline-none focus:ring-2 focus:ring-white disabled:opacity-60 sm:w-auto sm:max-w-52"><option value="" disabled>Choose context</option>{contexts.map(context => <option key={context.type === "platform" ? "platform" : `company:${context.membershipId}`} value={context.type === "platform" ? "platform" : `company:${context.membershipId}`}>{context.type === "platform" ? "Platform Administration" : `${context.companyName} · ${context.role}`}</option>)}</select></div>}
            <span className="hidden truncate text-sm text-blue-100 sm:inline">{user.full_name || user.email}</span>
            <span className="hidden whitespace-nowrap rounded bg-blue-700 px-2 py-1 text-xs sm:inline">{roleLabel(user.user_type)}</span>
            <button onClick={logout} className="whitespace-nowrap rounded bg-blue-700 px-3 py-1 text-sm hover:bg-blue-900">
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        <aside className={`${open ? "w-56" : "w-0 -ml-56"} transition-all flex-none bg-white border-r overflow-hidden`}>
          <nav className="p-2 space-y-1">
            {MENU.filter(m => {
              if (m.platformOnly) return platformAdmin;
              if (platformAdmin && m.tenantOnly) return false;
              if (user.user_type === "external" && ["My Projects", "Master Calendar", "Resource Calendar", "Resources"].includes(m.label)) return false;
              return !m.adminOnly || user.user_type === "admin" || user.user_type === "owner";
            }).map(m => {
              const active = pathname === m.href || (m.href !== "/" && pathname.startsWith(m.href));
              return (
                <Link
                  key={m.href} href={m.href}
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

        <main className="flex-1 min-w-0 overflow-auto p-4 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}
