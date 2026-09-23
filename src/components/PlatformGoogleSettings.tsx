"use client";

import { useEffect, useState } from "react";
import ActionFeedback, { type FeedbackKind } from "@/components/ActionFeedback";

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

function label(snapshot: Snapshot | null) {
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

export default function PlatformGoogleSettings() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({ privacyStatus: "draft" });
  const [environment, setEnvironment] = useState<"test" | "production">("production");
  const [clientSecret, setClientSecret] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [message, setMessage] = useState("Loading Google settings…");
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>("info");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/v1/platform/integration-settings/google", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) { setFeedbackKind("error"); setMessage(result.error?.message || "Google settings are unavailable."); return; }
    const next = result.data as Snapshot;
    setSnapshot(next); setConfig({ privacyStatus: "draft", ...next.config }); setEnvironment(next.environment); setMessage("");
  }

  useEffect(() => { void load(); }, []);

  async function action(name: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setFeedbackKind("info"); setMessage(name === "save" ? "Saving encrypted Google settings…" : "Updating Google settings…");
    try {
      const response = await fetch("/api/v1/platform/integration-settings/google", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ action: name, currentPassword, ...extra }),
      });
      const result = await response.json();
      if (!response.ok) { setFeedbackKind("error"); setMessage(result.error?.message || "Google settings could not be updated."); return; }
      if (result.data?.authorizationUrl) { window.location.assign(result.data.authorizationUrl); return; }
      const next = result.data as Snapshot;
      setSnapshot(next); setConfig({ privacyStatus: "draft", ...next.config }); setEnvironment(next.environment); setClientSecret(""); setCurrentPassword("");
      setFeedbackKind("success"); setMessage(name === "save" ? "Saved encrypted settings. Complete real OAuth verification before User connections are enabled." : "Google settings updated.");
    } catch { setFeedbackKind("error"); setMessage("Google settings are temporarily unavailable. Try again."); }
    finally { setBusy(false); }
  }

  const status = label(snapshot);
  const set = (key: string, value: string) => setConfig(current => ({ ...current, [key]: value }));
  return <section className="space-y-5 rounded-xl border border-blue-200 bg-white p-5 shadow-sm" aria-labelledby="platform-google-settings-heading">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Permanent Platform Integration Settings</p><h2 id="platform-google-settings-heading" className="text-xl font-bold">Google OAuth application settings</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">Scott can manage the platform OAuth application here without editing an environment file. The client secret is write-only and encrypted with the Railway-managed root key.</p></div>
      <span className={`rounded-full px-3 py-1 text-sm font-bold ${status === "Valid" ? "bg-emerald-100 text-emerald-900" : status === "Provider unavailable" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-800"}`}>{status}</span>
    </header>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Cloud project name" value={config.projectName || ""} onChange={value => set("projectName", value)} />
      <Field label="Cloud project ID" value={config.projectId || ""} onChange={value => set("projectId", value)} />
      <Field label="Web OAuth client ID" value={config.clientId || ""} onChange={value => set("clientId", value)} />
      <Field label="Support email" type="email" value={config.supportEmail || ""} onChange={value => set("supportEmail", value)} />
      <Field label="HTTPS privacy policy URL" type="url" value={config.privacyUrl || ""} onChange={value => set("privacyUrl", value)} />
      <label className="block text-sm font-semibold">Consent-screen status<select className="mt-1 block w-full rounded border p-2" value={config.privacyStatus || "draft"} onChange={event => set("privacyStatus", event.target.value)}><option value="draft">Draft</option><option value="published">Published</option><option value="verification_required">Verification required</option><option value="verified">Verified</option></select></label>
      <label className="block text-sm font-semibold">Environment<select className="mt-1 block w-full rounded border p-2" value={environment} onChange={event => setEnvironment(event.target.value as "test" | "production")}><option value="test">Test</option><option value="production">Production</option></select></label>
      <label className="block text-sm font-semibold">{snapshot?.credential.configured ? "Replacement client secret (optional)" : "OAuth client secret"}<input type="password" autoComplete="new-password" className="mt-1 block w-full rounded border p-2" value={clientSecret} onChange={event => setClientSecret(event.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500">Never returned to the browser. {snapshot?.credential.configured ? `Active version ${snapshot.credential.version}; fingerprint ${snapshot.credential.fingerprint}.` : "A secret is required for the first save."}</span></label>
      <label className="block text-sm font-semibold">Current Platform Administrator password<input type="password" autoComplete="current-password" className="mt-1 block w-full rounded border p-2" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500">Required for save, rotation, disable, enable, and revoke.</span></label>
    </div>
    <label className="block text-sm font-semibold">Authorized callback URL<input readOnly className="mt-1 block w-full rounded border bg-slate-50 p-2 font-mono text-xs" value={snapshot?.callbackUri || ""} /></label>
    <div className="rounded border bg-slate-50 p-3 text-sm"><strong>Least-privilege scope:</strong> <code>calendar.app.created</code>. Status becomes Valid only after a real callback and temporary Calendar create/read/delete capability check. <span className="block text-xs text-slate-600">Last verification: {snapshot?.verifiedAt ? new Date(snapshot.verifiedAt).toLocaleString() : "Never"}</span></div>
    <div className="flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => void action("save", { environment, config, secrets: { clientSecret } })} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{snapshot?.credential.configured ? "Save details / rotate secret" : "Save encrypted credential"}</button>
      <button disabled={busy || !snapshot?.credential.configured || !!snapshot?.disabledAt} onClick={() => void action("oauth_start")} className="rounded border border-blue-700 px-4 py-2 text-sm font-bold text-blue-800 disabled:opacity-40">Verify with Google</button>
      {snapshot?.disabledAt ? <button disabled={busy} onClick={() => void action("enable")} className="rounded border px-4 py-2 text-sm font-bold">Enable</button> : <button disabled={busy || !snapshot?.credential.configured} onClick={() => void action("disable")} className="rounded border px-4 py-2 text-sm font-bold">Disable</button>}
      <button disabled={busy || !snapshot?.credential.configured} onClick={() => void action("retry")} className="rounded border px-4 py-2 text-sm font-bold">Retry verification</button>
      <button disabled={busy || !snapshot?.credential.configured} onClick={() => window.confirm("Revoke the active Google client secret version?") && void action("revoke")} className="rounded border border-red-300 px-4 py-2 text-sm font-bold text-red-800 disabled:opacity-40">Revoke</button>
    </div>
    <ActionFeedback message={message} kind={feedbackKind} />
  </section>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange(value: string): void; type?: string }) {
  return <label className="block text-sm font-semibold">{label}<input type={type} className="mt-1 block w-full rounded border p-2" value={value} onChange={event => onChange(event.target.value)} /></label>;
}
