"use client";

import { useEffect, useState } from "react";

type Snapshot = {
  status: string;
  safeStatusCode: string | null;
  environment: "test" | "production";
  config: Record<string, string>;
  credential: { configured: boolean; fingerprint: string | null; lastFour: string | null; version: number };
  savedAt: string | null;
  verifiedAt: string | null;
  disabledAt: string | null;
  callbackUri: string;
};

function csrfToken() {
  return document.cookie.split("; ").find(item => item.startsWith("dialoggg_csrf="))?.split("=").slice(1).join("=") || "";
}

function statusLabel(snapshot: Snapshot | null) {
  if (!snapshot || !snapshot.credential.configured) return "Not configured";
  if (snapshot.disabledAt || snapshot.safeStatusCode === "DISABLED") return "Disabled";
  if (snapshot.safeStatusCode === "VERIFYING") return "Verifying";
  if (snapshot.status === "verified") return "Valid";
  if (snapshot.safeStatusCode?.includes("SCOPE") || snapshot.safeStatusCode?.includes("PERMISSION")) return "Permission missing";
  if (snapshot.safeStatusCode?.includes("UNREACHABLE") || snapshot.safeStatusCode?.includes("PROVIDER")) return "Provider unavailable";
  if (snapshot.safeStatusCode?.includes("EXPIRED") || snapshot.safeStatusCode?.includes("REVOKED")) return "Expired";
  if (snapshot.status === "saved") return "Saved—verification required";
  return "Invalid";
}

export default function PlatformMicrosoftSettings() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({ tenantId: "organizations" });
  const [environment, setEnvironment] = useState<"test" | "production">("production");
  const [clientSecret, setClientSecret] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [message, setMessage] = useState("Loading Microsoft settings…");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/v1/platform/integration-settings/microsoft", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error?.message || "Microsoft settings are unavailable."); return; }
    const next = result.data as Snapshot;
    setSnapshot(next); setConfig({ tenantId: "organizations", ...next.config }); setEnvironment(next.environment); setMessage("");
  }

  useEffect(() => { void load(); }, []);

  async function action(name: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setMessage(name === "save" ? "Saving encrypted Microsoft settings…" : "Updating Microsoft settings…");
    try {
      const response = await fetch("/api/v1/platform/integration-settings/microsoft", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ action: name, currentPassword, ...extra }),
      });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error?.message || "Microsoft settings could not be updated."); return; }
      if (result.data?.authorizationUrl) { window.location.assign(result.data.authorizationUrl); return; }
      const next = result.data as Snapshot;
      setSnapshot(next); setConfig({ tenantId: "organizations", ...next.config }); setEnvironment(next.environment); setClientSecret(""); setCurrentPassword("");
      setMessage(name === "save" ? "Saved encrypted settings. Complete real Microsoft OAuth verification before company connections are enabled." : "Microsoft settings updated.");
    } finally { setBusy(false); }
  }

  const status = statusLabel(snapshot);
  const set = (key: string, value: string) => setConfig(current => ({ ...current, [key]: value }));
  return <section className="space-y-5 rounded-xl border border-indigo-200 bg-white p-5 shadow-sm" aria-labelledby="platform-microsoft-settings-heading">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Permanent Platform Integration Settings</p><h2 id="platform-microsoft-settings-heading" className="text-xl font-bold">Microsoft OAuth / Graph application settings</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">Scott can manage the platform Entra application here without editing an environment file. The client secret is write-only and encrypted with the Railway-managed root key.</p></div>
      <span className={`rounded-full px-3 py-1 text-sm font-bold ${status === "Valid" ? "bg-emerald-100 text-emerald-900" : status === "Provider unavailable" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-800"}`}>{status}</span>
    </header>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Application name" value={config.applicationName || ""} onChange={value => set("applicationName", value)} />
      <Field label="Microsoft Entra tenant ID" value={config.tenantId || "organizations"} onChange={value => set("tenantId", value)} />
      <Field label="Application (client) ID" value={config.clientId || ""} onChange={value => set("clientId", value)} />
      <Field label="Verified publisher domain" value={config.publisherDomain || ""} onChange={value => set("publisherDomain", value)} />
      <label className="block text-sm font-semibold">Environment<select className="mt-1 block w-full rounded border p-2" value={environment} onChange={event => setEnvironment(event.target.value as "test" | "production")}><option value="test">Test</option><option value="production">Production</option></select></label>
      <label className="block text-sm font-semibold">{snapshot?.credential.configured ? "Replacement client secret value (optional)" : "Client secret value"}<input type="password" autoComplete="new-password" className="mt-1 block w-full rounded border p-2" value={clientSecret} onChange={event => setClientSecret(event.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500">The secret value—not its ID—is required and is never returned. {snapshot?.credential.configured ? `Active version ${snapshot.credential.version}; fingerprint ${snapshot.credential.fingerprint}.` : "A secret is required for the first save."}</span></label>
      <label className="block text-sm font-semibold md:col-span-2">Current Platform Administrator password<input type="password" autoComplete="current-password" className="mt-1 block w-full rounded border p-2" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500">Required for save, rotation, disable, enable, and revoke.</span></label>
    </div>
    <label className="block text-sm font-semibold">Authorized callback URL<input readOnly className="mt-1 block w-full rounded border bg-slate-50 p-2 font-mono text-xs" value={snapshot?.callbackUri || ""} /></label>
    <div className="rounded border bg-slate-50 p-3 text-sm"><strong>Delegated least-privilege scope:</strong> <code>Files.ReadWrite</code> plus identity and offline access. Status becomes Valid only after a real callback and temporary Graph create/read/delete capability check. <span className="block text-xs text-slate-600">Last verification: {snapshot?.verifiedAt ? new Date(snapshot.verifiedAt).toLocaleString() : "Never"}</span></div>
    <div className="flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => void action("save", { environment, config, secrets: { clientSecret } })} className="rounded bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{snapshot?.credential.configured ? "Save details / rotate secret" : "Save encrypted credential"}</button>
      <button disabled={busy || !snapshot?.credential.configured || !!snapshot?.disabledAt} onClick={() => void action("oauth_start")} className="rounded border border-indigo-700 px-4 py-2 text-sm font-bold text-indigo-800 disabled:opacity-40">Verify with Microsoft</button>
      {snapshot?.disabledAt ? <button disabled={busy} onClick={() => void action("enable")} className="rounded border px-4 py-2 text-sm font-bold">Enable</button> : <button disabled={busy || !snapshot?.credential.configured} onClick={() => void action("disable")} className="rounded border px-4 py-2 text-sm font-bold">Disable</button>}
      <button disabled={busy || !snapshot?.credential.configured} onClick={() => void action("retry")} className="rounded border px-4 py-2 text-sm font-bold">Retry verification</button>
      <button disabled={busy || !snapshot?.credential.configured} onClick={() => window.confirm("Revoke the active Microsoft client secret version?") && void action("revoke")} className="rounded border border-red-300 px-4 py-2 text-sm font-bold text-red-800 disabled:opacity-40">Revoke</button>
    </div>
    <p role="status" aria-live="polite" className="text-sm text-slate-700">{message}</p>
  </section>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  return <label className="block text-sm font-semibold">{label}<input className="mt-1 block w-full rounded border p-2" value={value} onChange={event => onChange(event.target.value)} /></label>;
}
