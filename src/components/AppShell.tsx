"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { roleLabel } from "@/lib/product-language";
import { authenticatedFetch } from "@/lib/client-fetch";
import dialogggLogo from "../../dialoggg-lockup-transparent-onDark.png";

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
  { label: "Companies",          href: "/platform/companies",  icon: "building", adminOnly: false, platformOnly: true, tenantOnly: false },
  { label: "All Projects",       href: "/projects",            icon: "folder", adminOnly: false, platformOnly: false, tenantOnly: true },
  { label: "My Projects",        href: "/projects/mine",       icon: "folder-user", adminOnly: false, platformOnly: false, tenantOnly: true },
  { label: "Master Calendar",    href: "/calendar",            icon: "calendar", adminOnly: false, platformOnly: false, tenantOnly: true },
  { label: "Resource Calendar",  href: "/resources/schedule",  icon: "calendar-users", adminOnly: false, platformOnly: false, tenantOnly: true },
  { label: "Resources",          href: "/resources",           icon: "user", adminOnly: false, platformOnly: false, tenantOnly: true },
  { label: "Users",              href: "/users",               icon: "users", adminOnly: true, platformOnly: false, tenantOnly: true },
  { label: "Project Types",      href: "/settings/project-types", icon: "tag", adminOnly: true, platformOnly: false, tenantOnly: true },
  { label: "Project Templates",  href: "/templates",           icon: "file", adminOnly: true, platformOnly: false, tenantOnly: true },
  { label: "Microsoft Storage",  href: "/settings/microsoft-storage", icon: "cloud", adminOnly: true, platformOnly: false, tenantOnly: true },
  { label: "Account",            href: "/account",             icon: "settings", adminOnly: false, platformOnly: false, tenantOnly: false },
  { label: "Help",               href: "/help",                icon: "help", adminOnly: false, platformOnly: false, tenantOnly: false },
] as const;

type MenuIconName = (typeof MENU)[number]["icon"];

function MenuIcon({ name }: { name: MenuIconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" {...common}>
    {name === "building" && <><path d="M3 21h18M5 21V5l7-2v18M19 21V9l-7-2"/><path d="M8 7h1m-1 4h1m-1 4h1m8-2h1m-1 4h1"/></>}
    {name === "folder" && <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>}
    {name === "folder-user" && <><path d="M3 7a1.5 1.5 0 0 1 1.5-1.5H10l2 2h7.5A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="12" r="1.7"/><path d="M8.8 17a3.4 3.4 0 0 1 6.4 0"/></>}
    {name === "calendar" && <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/></>}
    {name === "calendar-users" && <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 9h18"/><circle cx="9" cy="14" r="1.3"/><circle cx="15" cy="14" r="1.3"/><path d="M6.8 18a2.3 2.3 0 0 1 4.4 0m1.8 0a2.3 2.3 0 0 1 4.2 0"/></>}
    {name === "user" && <><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></>}
    {name === "users" && <><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0m-1-9.5a3 3 0 1 0 0-5.8M17 14a5.5 5.5 0 0 1 4 5.3"/></>}
    {name === "tag" && <><path d="M20.5 13 13 20.5a2.1 2.1 0 0 1-3 0L3.5 14V4h10z"/><circle cx="8" cy="8" r="1.2"/></>}
    {name === "file" && <><path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4M8 12h8m-8 4h8"/></>}
    {name === "cloud" && <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z"/>}
    {name === "settings" && <><path d="M12 3.5v2m0 13v2m8.5-8.5h-2m-13 0h-2m15-6-1.4 1.4M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6"/><circle cx="12" cy="12" r="7.2"/><circle cx="12" cy="12" r="2.7"/></>}
    {name === "help" && <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 4 1.8c-1 .8-1.7 1.2-1.7 2.7M12 17h.01"/></>}
  </svg>;
}

export default function AppShell({ user, children, companyName, companyLogoUrl }: { user: User; children: React.ReactNode; companyName: string | null; companyLogoUrl: string | null }) {
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
  const [companyLogoAvailable, setCompanyLogoAvailable] = useState(Boolean(companyLogoUrl));
  const platformAdmin = user.user_type === "super_admin";

  useEffect(() => { setCompanyLogoAvailable(Boolean(companyLogoUrl)); }, [companyLogoUrl]);

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

  function renderAccountControls(location: "header" | "sidebar") {
    const inSidebar = location === "sidebar";
    return (
      <div className={inSidebar ? "flex w-full flex-col gap-3 lg:hidden" : "hidden min-w-0 items-center gap-2 sm:gap-4 lg:flex"}>
        {contexts.length > 1 && <div className={inSidebar ? "w-full" : ""}><label htmlFor={`active-company-context-${location}`} className="sr-only">Active company context</label><select id={`active-company-context-${location}`} value={activeContext} disabled={switchingContext} onChange={event => switchContext(event.target.value)} className={`h-10 rounded border border-blue-500 bg-blue-900 px-2 text-xs font-semibold text-white outline-none focus:ring-2 focus:ring-white disabled:opacity-60 ${inSidebar ? "w-full" : "w-32 max-w-32 sm:w-auto sm:max-w-52"}`}><option value="" disabled>Choose context</option>{contexts.map(context => <option key={context.type === "platform" ? "platform" : `company:${context.membershipId}`} value={context.type === "platform" ? "platform" : `company:${context.membershipId}`}>{context.type === "platform" ? "Platform Administration" : `${context.companyName} · ${context.role}`}</option>)}</select></div>}
        <span className={inSidebar ? "truncate text-sm text-slate-600" : "hidden truncate text-sm text-blue-100 sm:inline"}>{user.full_name || user.email}</span>
        {(actualRole === "owner" || actualRole === "admin") && activeContext.startsWith("company:") ? (
          <div className={inSidebar ? "w-full" : "flex items-center gap-1"}>
            <label htmlFor={`role-preview-${location}`} className="sr-only">Preview company role</label>
            <select
              id={`role-preview-${location}`}
              aria-label="Preview company role"
              value={previewRole}
              disabled={switchingRole}
              onChange={event => switchRole(event.target.value)}
              className={`tenant-role-switch h-10 min-h-10 rounded border px-2 py-0 text-xs font-semibold outline-none disabled:opacity-60 ${inSidebar ? "w-full" : "max-w-36 sm:max-w-48"}`}
            >
              {actualRole === "owner" && <option value="owner">Owner</option>}
              {(actualRole === "owner" || actualRole === "admin") && <option value="admin">Admin</option>}
              <option value="employee">Employee</option>
              <option value="external">External</option>
            </select>
            {!inSidebar && rolePreviewEnabled && <span className="role-preview-chip hidden h-10 items-center rounded px-2 text-xs font-semibold md:inline-flex">Read-only preview</span>}
          </div>
        ) : (
          <span className={inSidebar ? "inline-flex h-10 items-center rounded bg-blue-700 px-2 text-xs text-white" : "hidden h-10 items-center whitespace-nowrap rounded bg-blue-700 px-2 text-xs sm:inline-flex"}>{roleLabel(user.user_type)}</span>
        )}
        <div className={inSidebar ? "flex w-full items-center justify-between gap-3" : "contents"}>
          {companyLogoUrl && companyLogoAvailable && !platformAdmin && <div className={`flex h-10 shrink-0 items-center justify-center overflow-hidden rounded bg-white p-1 ${inSidebar ? "w-16" : "w-12 sm:w-16"}`} title={`${companyName || "Company"} logo`}>
            <img src={companyLogoUrl} alt={`${companyName || "Company"} logo`} onError={() => setCompanyLogoAvailable(false)} className="max-h-full max-w-full object-contain" />
          </div>}
          <button onClick={logout} className="tenant-logout-button inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded px-3 text-sm">
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${platformAdmin ? "" : "tenant-theme"}`}>
      <header className="relative z-50 flex-none bg-blue-800 text-white shadow-md">
        <div className="flex items-center justify-between gap-3 px-3 py-2 lg:px-4 lg:py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setOpen(current => !current)} aria-controls="primary-navigation" aria-expanded={open} aria-label={open ? "Close navigation" : "Open navigation"} className="rounded p-1 text-2xl focus:outline-none focus:ring-2 focus:ring-white lg:hidden">☰</button>
            <Image src={dialogggLogo} alt="Dialoggg" width={180} height={40} priority className="h-8 w-auto max-w-[min(180px,calc(100vw-4.5rem))] shrink-0 object-contain sm:h-9 sm:max-w-[180px]" />
          </div>
          {renderAccountControls("header")}
        </div>
      </header>

      {rolePreviewEnabled && <div className="relative z-40 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow">Viewing as {roleLabel(previewRole)}. Changes are disabled during role preview. Select your own role ({roleLabel(actualRole)}) to exit.</div>}
      <div className="flex flex-1">
        {open && <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" />}
        <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col flex-none transform overflow-y-auto border-r bg-white pt-14 shadow-xl transition-transform sm:pt-16 lg:static lg:z-auto lg:w-56 lg:max-w-none lg:translate-x-0 lg:pt-0 lg:shadow-none ${open ? "translate-x-0" : "-translate-x-full"}`}>
          <nav id="primary-navigation" className="flex-1 space-y-1 p-2" aria-label="Primary navigation">
            {MENU.filter(m => {
              if (m.platformOnly) return platformAdmin;
              if (platformAdmin && m.tenantOnly) return false;
              if (user.user_type === "external" && ["My Projects", "Master Calendar", "Resource Calendar", "Resources"].includes(m.label)) return false;
              return !m.adminOnly || user.user_type === "admin" || user.user_type === "owner";
            }).map(m => {
              const activeMenuItem = MENU
                .filter(item => pathname === item.href || pathname.startsWith(`${item.href}/`))
                .sort((left, right) => right.href.length - left.href.length)[0];
              const active = activeMenuItem?.href === m.href;
              return (
                <Link
                  key={m.href} href={m.href} onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
                    active ? "bg-blue-100 text-blue-800 font-semibold" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <MenuIcon name={m.icon} />
                  <span>{m.label}</span>
                </Link>
              );
            })}
          </nav>
          <section aria-label="Account controls" className="m-3 mt-auto rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm lg:hidden">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Account</h2>
            {renderAccountControls("sidebar")}
          </section>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto bg-gray-50 p-3 sm:p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
