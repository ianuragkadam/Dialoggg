"use client";

import { useEffect, useState } from "react";

type DeliveryItem = {
  id: number;
  kind: string;
  status: string;
  recipientDomain: string | null;
  attempts: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  nextAttemptAt: string;
  expiresAt: string | null;
  retryable: boolean;
};

type Snapshot = {
  status: string;
  safeStatusCode: string | null;
  environment: "test" | "production";
  config: Record<string, string>;
  credential: { configured: boolean; fingerprint: string | null; lastFour: string | null; version: number };
  savedAt: string | null;
  verifiedAt: string | null;
  disabledAt: string | null;
  validation: { details?: Record<string, string>; completedAt?: string | null };
  delivery: Record<string, number>;
  recent: DeliveryItem[];
};

function csrfToken() {
  return document.cookie.split("; ").find(item => item.startsWith("dialoggg_csrf="))?.split("=").slice(1).join("=") || "";
}

function statusLabel(snapshot: Snapshot | null) {
  if (!snapshot || !snapshot.credential.configured) return "Not configured";
  if (snapshot.disabledAt || snapshot.safeStatusCode === "DISABLED") return "Disabled";
  if (snapshot.safeStatusCode === "VERIFYING") return "Verifying";
  if (snapshot.status === "verified") return "Valid";
  if (snapshot.safeStatusCode?.includes("UNREACHABLE") || snapshot.safeStatusCode?.includes("PROVIDER")) return "Provider unavailable";
  if (snapshot.safeStatusCode?.includes("REJECTED") || snapshot.safeStatusCode?.includes("REVOKED")) return "Invalid";
  if (snapshot.status === "saved") return "Saved—verification required";
  return "Invalid";
}

export default function PlatformResendSettings() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [environment, setEnvironment] = useState<"test" | "production">("production");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [message, setMessage] = useState("Loading Resend settings…");
  const [busy, setBusy] = useState(false);

  function accept(next: Snapshot) {
    setSnapshot(next);
    setConfig(next.config);
    setEnvironment(next.environment);
    setApiKey("");
    setWebhookSecret("");
  }

  async function load() {
    const response = await fetch("/api/v1/platform/integration-settings/resend", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error?.message || "Resend settings are unavailable."); return; }
    accept(result.data as Snapshot);
    setMessage("");
  }

  useEffect(() => { void load(); }, []);

  async function action(name: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage(name === "save" ? "Saving encrypted Resend settings…" : "Updating Resend settings…");
    try {
      const response = await fetch("/api/v1/platform/integration-settings/resend", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({
          action: name,
          ...(["save", "disable", "enable", "revoke", "retry_job"].includes(name) ? { currentPassword } : {}),
          ...extra,
        }),
      });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error?.message || "Resend settings could not be updated."); return; }
      accept(result.data as Snapshot);
      if (["save", "disable", "enable", "revoke", "retry_job"].includes(name)) setCurrentPassword("");
      setMessage(name === "validate" || name === "retry_validation" ? "Resend domain and sender verified." : name === "test_send" ? "One confirmed test email was accepted by Resend." : "Resend settings updated.");
    } catch {
      setMessage("Resend settings are temporarily unavailable. Try again.");
    } finally { setBusy(false); }
  }

  const set = (key: string, value: string) => setConfig(current => ({ ...current, [key]: value }));
  const status = statusLabel(snapshot);
  const dns = snapshot?.validation?.details || {};
  const retryable = snapshot?.recent.filter(item => ["dead", "retry"].includes(item.status) && item.retryable) || [];

  return <section className="space-y-5 rounded-xl border border-rose-200 bg-white p-5 shadow-sm" aria-labelledby="platform-resend-settings-heading">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wide text-rose-700">Permanent Platform Integration Settings</p><h2 id="platform-resend-settings-heading" className="text-xl font-bold">Resend transactional email settings</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">Configure the shared invitation, password-reset, and operational sender. API and webhook secrets are write-only, versioned, and encrypted with the Railway-managed root key.</p></div>
      <span className={`rounded-full px-3 py-1 text-sm font-bold ${status === "Valid" ? "bg-emerald-100 text-emerald-900" : status === "Provider unavailable" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-800"}`}>{status}</span>
    </header>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Verified sending domain" value={config.sendingDomain || ""} onChange={value => set("sendingDomain", value)} />
      <Field label="From name" value={config.fromName || ""} onChange={value => set("fromName", value)} />
      <Field label="From address" type="email" value={config.fromAddress || ""} onChange={value => set("fromAddress", value)} />
      <Field label="Reply-To / support address" type="email" value={config.replyTo || ""} onChange={value => set("replyTo", value)} />
      <label className="block text-sm font-semibold">Environment<select className="mt-1 block w-full rounded border p-2" value={environment} onChange={event => setEnvironment(event.target.value as "test" | "production")}><option value="test">Test</option><option value="production">Production</option></select></label>
      <label className="block text-sm font-semibold">{snapshot?.credential.configured ? "Replacement API key (optional)" : "Resend API key"}<input type="password" autoComplete="new-password" className="mt-1 block w-full rounded border p-2" value={apiKey} onChange={event => setApiKey(event.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500">Never returned to the browser. {snapshot?.credential.configured ? `Active version ${snapshot.credential.version}; fingerprint ${snapshot.credential.fingerprint}.` : "Required on first save."}</span></label>
      <label className="block text-sm font-semibold">Replacement webhook signing secret (optional)<input type="password" autoComplete="new-password" className="mt-1 block w-full rounded border p-2" value={webhookSecret} onChange={event => setWebhookSecret(event.target.value)} /></label>
      <label className="block text-sm font-semibold">Current Platform Administrator password<input type="password" autoComplete="current-password" className="mt-1 block w-full rounded border p-2" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500">Required for save, rotation, disable, enable, revoke, and manual retry.</span></label>
    </div>
    <div className="rounded border bg-slate-50 p-3 text-sm"><strong>Read-only verification:</strong> DNS {dns.dnsStatus || "not checked"}; SPF {dns.spf || "not checked"}; DKIM {dns.dkim || "not checked"}. Validation never sends email. <span className="block text-xs text-slate-600">Last verification: {snapshot?.verifiedAt ? new Date(snapshot.verifiedAt).toLocaleString() : "Never"}</span></div>
    <div className="flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => void action("save", { environment, config, secrets: { apiKey, webhookSecret } })} className="rounded bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{snapshot?.credential.configured ? "Save details / rotate secret" : "Save encrypted credential"}</button>
      <button disabled={busy || !snapshot?.credential.configured || !!snapshot?.disabledAt} onClick={() => void action("validate")} className="rounded border border-rose-700 px-4 py-2 text-sm font-bold text-rose-800 disabled:opacity-40">Validate domain and sender</button>
      {snapshot?.disabledAt ? <button disabled={busy} onClick={() => void action("enable")} className="rounded border px-4 py-2 text-sm font-bold">Enable</button> : <button disabled={busy || !snapshot?.credential.configured} onClick={() => void action("disable")} className="rounded border px-4 py-2 text-sm font-bold">Disable</button>}
      <button disabled={busy || !snapshot?.credential.configured} onClick={() => void action("retry_validation")} className="rounded border px-4 py-2 text-sm font-bold">Retry verification</button>
      <button disabled={busy || !snapshot?.credential.configured} onClick={() => window.confirm("Revoke the active Resend credential version?") && void action("revoke")} className="rounded border border-red-300 px-4 py-2 text-sm font-bold text-red-800 disabled:opacity-40">Revoke</button>
    </div>
    {snapshot?.status === "verified" && <div className="flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-end"><div className="flex-1"><Field label="Confirmed test recipient" type="email" value={testRecipient} onChange={setTestRecipient} /></div><button disabled={busy || !testRecipient} className="rounded border border-emerald-700 px-4 py-2.5 text-sm font-bold text-emerald-800 disabled:opacity-40" onClick={() => window.confirm(`Send one Resend test email to ${testRecipient}?`) && void action("test_send", { recipient: testRecipient, confirmed: true })}>Confirm and send one test</button></div>}
    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-7">{["pending", "running", "retry", "completed", "dead", "cancelled"].map(key => <div key={key} className="rounded border bg-slate-50 p-2"><strong className="block text-lg">{snapshot?.delivery[key] || 0}</strong><span className="capitalize text-slate-600">{key}</span></div>)}</div>
    {retryable.length > 0 && <div><h3 className="font-bold">Delivery attention</h3><div className="mt-2 space-y-2">{retryable.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm"><span><strong>{item.kind.replaceAll("_", " ")}</strong> · {item.recipientDomain || "domain unavailable"} · {item.attempts}/{item.maxAttempts} attempts · {item.lastErrorCode || item.status}</span><button disabled={busy || !currentPassword} className="rounded border border-amber-700 px-3 py-1 font-bold text-amber-900 disabled:opacity-40" onClick={() => void action("retry_job", { jobId: item.id })}>Retry now</button></div>)}</div></div>}
    <p role="status" aria-live="polite" className="text-sm text-slate-700">{message}</p>
  </section>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange(value: string): void; type?: string }) {
  return <label className="block text-sm font-semibold">{label}<input type={type} className="mt-1 block w-full rounded border p-2" value={value} onChange={event => onChange(event.target.value)} /></label>;
}
