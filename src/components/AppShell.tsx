"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { roleLabel } from "@/lib/product-language";

type User = { id: number; email: string; full_name: string | null; user_type: string };

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
  { label: "Account",            href: "/account",             icon: "⚙️", adminOnly: false, platformOnly: false, tenantOnly: false },
  { label: "Help",               href: "/help",                icon: "❓", adminOnly: false, platformOnly: false, tenantOnly: false },
];

export default function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const platformAdmin = user.user_type === "super_admin";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
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
              return !m.adminOnly || user.user_type === "admin";
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
