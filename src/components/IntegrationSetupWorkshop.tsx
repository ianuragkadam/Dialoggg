"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Provider = "google_platform" | "microsoft_platform" | "resend_platform";
type Status = "not_started" | "saved" | "action_required" | "verified";
type ProviderSnapshot = {
  provider: Provider;
  status: Status;
  safeStatusCode: string | null;
  environment: "test" | "production";
  config: Record<string, string>;
  credential: { configured: boolean; fingerprint: string | null; lastFour: string | null; version: number };
  savedAt: string | null;
  verifiedAt: string | null;
  updatedAt: string | null;
  callbackUri: string | null;
};
type Snapshot = {
  accessKind: "workshop" | "review";
  invitation: { label: string; scopeKind: string; companyId: number | null; companyName: string | null; expiresAt: string; completedAt: string | null };
  providers: ProviderSnapshot[];
  canComplete: boolean;
};

const LABELS: Record<Provider, string> = {
  google_platform: "Google Calendar",
  microsoft_platform: "Microsoft OAuth / Graph application",
  resend_platform: "Resend email",
};
const STATUS_LABELS: Record<Status, string> = {
  not_started: "Not started",
  saved: "Saved, needs verification",
  action_required: "Action required",
  verified: "Verified",
};

function cookie(name: string) {
  return document.cookie.split("; ").find(item => item.startsWith(`${name}=`))?.split("=").slice(1).join("=") || "";
}

function friendlyTime(value: string | null) {
  if (!value) return "Not yet";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized).toLocaleString();
}

async function exchangeFragment() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const token = hash.get("token");
  if (!token) return;
  try {
    const response = await fetch("/api/integration-setup/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error("INVITATION_INVALID");
  } finally {
    window.history.replaceState(null, "", window.location.pathname);
  }
}

export default function IntegrationSetupWorkshop({ review = false }: { review?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [forms, setForms] = useState<Partial<Record<Provider, Record<string, string>>>>({});
  const [secrets, setSecrets] = useState<Partial<Record<Provider, Record<string, string>>>>({});
  const [busy, setBusy] = useState<string | null>("Opening private invitation…");
  const [message, setMessage] = useState("");
  const [denied, setDenied] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const loadedRef = useRef(false);
  const mutationRef = useRef(0);

  async function load() {
    const response = await fetch(review ? "/api/integration-setup/review" : "/api/integration-setup", { cache: "no-store" });
    if (!response.ok) throw new Error("SESSION_REQUIRED");
    const result = await response.json();
    const next = result.data as Snapshot;
    if (review && next.accessKind !== "review" || !review && next.accessKind !== "workshop") throw new Error("LINK_TYPE_INVALID");
    setSnapshot(next);
    setForms(Object.fromEntries(next.providers.map(item => [item.provider, item.config])));
    loadedRef.current = true;
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await exchangeFragment();
        if (!alive) return;
        await load();
      } catch {
        if (alive) setDenied(true);
      } finally { if (alive) setBusy(null); }
    })();
    return () => { alive = false; };
  }, [review]);

  const completeCount = snapshot?.providers.filter(item => item.status === "verified").length ?? 0;
  const progress = snapshot?.providers.length ? Math.round(completeCount / snapshot.providers.length * 100) : 0;

  function update(provider: Provider, key: string, value: string, secret = false) {
    if (secret) setSecrets(current => ({ ...current, [provider]: { ...(current[provider] || {}), [key]: value } }));
    else setForms(current => ({ ...current, [provider]: { ...(current[provider] || {}), [key]: value } }));
  }

  async function mutate(action: string, provider?: Provider, extra: Record<string, unknown> = {}) {
    const mutationId = ++mutationRef.current;
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch("/api/integration-setup", {
        method: "POST",
        headers: { "content-type": "application/json", "x-workshop-csrf": cookie("dialoggg_integration_csrf") },
        body: JSON.stringify({ action, provider, config: provider ? forms[provider] || {} : undefined, secrets: provider ? secrets[provider] || {} : undefined, environment: "production", ...extra }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.code || "UPDATE_FAILED");
      if (mutationId !== mutationRef.current && action === "autosave") return null;
      if (result.data?.providers) {
        setSnapshot(result.data);
        if (action !== "autosave") {
          setForms(Object.fromEntries(result.data.providers.map((item: ProviderSnapshot) => [item.provider, item.config])));
        }
      }
      if (provider && action === "save") setSecrets(current => ({ ...current, [provider]: {} }));
      if (result.data?.authorizationUrl) window.location.assign(result.data.authorizationUrl);
      setMessage(action === "autosave" ? "Non-secret details autosaved." : action === "complete" ? "Workshop completed." : "Saved securely.");
      return result.data;
    } catch (error) {
      if (mutationId === mutationRef.current) setMessage(error instanceof Error ? `Action required: ${error.message.replaceAll("_", " ").toLowerCase()}.` : "Action required. Try again.");
      return null;
    } finally { if (mutationId === mutationRef.current) setBusy(null); }
  }

  async function autosave(provider: Provider) {
    if (!loadedRef.current) return;
    await mutate("autosave", provider);
  }

  async function save(provider: Provider) {
    const item = snapshot?.providers.find(candidate => candidate.provider === provider);
    const replacing = item?.credential.configured && Object.values(secrets[provider] || {}).some(Boolean);
    if (replacing && !window.confirm(`Replace the stored ${LABELS[provider]} credential? The previous encrypted version will be retired and cannot be viewed again.`)) return;
    await mutate("save", provider);
  }

  async function revoke(provider: Provider) {
    if (!window.confirm(`Revoke the stored ${LABELS[provider]} credential? This setup will return to Not started.`)) return;
    await mutate("revoke", provider);
  }

  async function sendTest() {
    if (!window.confirm(`Send one Resend test email to ${testRecipient}? Nothing is sent automatically.`)) return;
    await mutate("send_test", "resend_platform", { recipient: testRecipient, confirmed: true });
  }

  if (busy === "Opening private invitation…") return <main className="mx-auto max-w-5xl p-6"><p role="status">Opening the secure integration workshop…</p></main>;
  if (denied || !snapshot) return <main className="mx-auto max-w-3xl p-6"><section className="rounded-xl border border-red-300 bg-white p-6"><h1 className="text-2xl font-bold">Private link required</h1><p className="mt-2">This invitation is invalid, expired, revoked, or belongs to the other access page. Ask the Platform Administrator for a fresh private link.</p></section></main>;
  if (review) return <IntegrationReview snapshot={snapshot} progress={progress} />;

  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <header className="rounded-2xl bg-slate-950 p-6 text-white shadow-lg">
      <p className="text-sm font-semibold uppercase tracking-widest text-blue-300">Private operational workshop</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Connect Dialoggg securely</h1>
      <p className="mt-3 max-w-3xl text-slate-200">Follow each provider’s numbered steps, save the credential once, and verify the connection. You can safely return with the same private link until {friendlyTime(snapshot.invitation.expiresAt)}.</p>
      <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-slate-900"><strong>Privacy first:</strong> Never enter a personal Google or Microsoft password here. Use provider-owned consent screens. Only credentials for accounts you own or are authorized to administer may be connected.</div>
    </header>

    <section aria-label="Setup progress" className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Setup progress</h2><strong>{completeCount} of {snapshot.providers.length} verified</strong></div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full bg-green-600 transition-all" style={{ width: `${progress}%` }} /></div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-3">{snapshot.providers.map(item => <li key={item.provider} className="rounded-lg border p-3"><span className="block font-semibold">{LABELS[item.provider]}</span><StatusBadge status={item.status} /></li>)}</ul>
      {snapshot.invitation.companyName && <p className="mt-3 text-sm text-slate-600">Company scope: {snapshot.invitation.companyName}</p>}
      {snapshot.providers.length === 0 && <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><strong>No platform credentials are requested by this company-scoped invitation.</strong><p className="mt-1">A company Owner or Admin connects Microsoft storage from Settings → Microsoft Storage after the Platform Microsoft application is verified.</p></div>}
    </section>

    {snapshot.providers.map((item, index) => <ProviderSection
      key={item.provider} item={item} number={index + 1} form={forms[item.provider] || {}} secret={secrets[item.provider] || {}}
      busy={!!busy} testRecipient={testRecipient} onTestRecipient={setTestRecipient}
      onChange={(key, value, secret) => update(item.provider, key, value, secret)}
      onBlur={() => void autosave(item.provider)} onSave={() => void save(item.provider)}
      onConnect={() => void mutate(item.provider === "resend_platform" ? "validate" : "oauth_start", item.provider)}
      onRevoke={() => void revoke(item.provider)} onSendTest={() => void sendTest()}
    />)}

    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold">Finish</h2>
      <p className="mt-2">{snapshot.providers.length ? "Completion unlocks only after every provider in this invitation is Verified." : "There are no platform credentials to complete in this company-scoped invitation."}</p>
      <button className="mt-4 rounded-lg bg-green-700 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={!snapshot.canComplete || !!busy} onClick={() => void mutate("complete")}>{snapshot.invitation.completedAt ? "Completed" : "Mark setup complete"}</button>
    </section>
    <p role="status" aria-live="polite" className="sticky bottom-3 rounded-lg border bg-white/95 p-3 text-sm shadow">{busy ? "Working securely…" : message || "Secrets are encrypted when saved and cannot be viewed again."}</p>
  </main>;
}

function StatusBadge({ status }: { status: Status }) {
  const tone = status === "verified" ? "bg-green-100 text-green-800" : status === "action_required" ? "bg-red-100 text-red-800" : status === "saved" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700";
  return <span className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-bold ${tone}`}>{STATUS_LABELS[status]}</span>;
}

function Field({ label, value, onChange, onBlur, type = "text", hint, required = true }: { label: string; value: string; onChange: (value: string) => void; onBlur?: () => void; type?: string; hint?: string; required?: boolean }) {
  return <label className="block text-sm font-semibold">{label}{required && <span aria-hidden="true"> *</span>}
    <input className="mt-1 block w-full rounded-lg border border-slate-300 p-2.5 font-normal" type={type} value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur} autoComplete="off" required={required} />
    {hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
  </label>;
}

function ProviderSection(props: {
  item: ProviderSnapshot; number: number; form: Record<string, string>; secret: Record<string, string>; busy: boolean;
  testRecipient: string; onTestRecipient: (value: string) => void; onChange: (key: string, value: string, secret?: boolean) => void;
  onBlur: () => void; onSave: () => void; onConnect: () => void; onRevoke: () => void; onSendTest: () => void;
}) {
  const { item, form, secret } = props;
  const canVerify = item.credential.configured && item.status !== "verified";
  return <details open className="group rounded-xl border bg-white shadow-sm">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5"><span className="text-xl font-bold">{props.number}. {LABELS[item.provider]}</span><StatusBadge status={item.status} /></summary>
    <div className="border-t p-5">
      {item.provider === "google_platform" && <>
        <ol className="list-decimal space-y-2 pl-5 text-sm"><li>Open <a className="text-blue-700 underline" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a> and select the platform project.</li><li>Enable the <a className="text-blue-700 underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Google Calendar API</a>.</li><li>Configure the OAuth consent screen, support email, privacy URL, and an OAuth Web application.</li><li>Add the exact redirect URI below. Start with <code>calendar.app.created</code> and offline access.</li><li>Save, then use Google’s consent screen to connect and verify the dedicated <strong>Dialoggg</strong> calendar.</li></ol>
        <Callback value={item.callbackUri} />
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Cloud project name" value={form.projectName || ""} onChange={value => props.onChange("projectName", value)} onBlur={props.onBlur} /><Field label="Cloud project ID" value={form.projectId || ""} onChange={value => props.onChange("projectId", value)} onBlur={props.onBlur} /><Field label="OAuth client ID" value={form.clientId || ""} onChange={value => props.onChange("clientId", value)} onBlur={props.onBlur} /><Field label="Support email" type="email" value={form.supportEmail || ""} onChange={value => props.onChange("supportEmail", value)} onBlur={props.onBlur} /><Field label="Privacy policy URL" type="url" value={form.privacyUrl || ""} onChange={value => props.onChange("privacyUrl", value)} onBlur={props.onBlur} /><label className="block text-sm font-semibold">Privacy / consent status *<select className="mt-1 block w-full rounded-lg border p-2.5 font-normal" value={form.privacyStatus || "draft"} onChange={event => props.onChange("privacyStatus", event.target.value)} onBlur={props.onBlur}><option value="draft">Draft / testing</option><option value="published">Published / production</option></select></label><Field label={item.credential.configured ? "Replacement client secret (optional)" : "OAuth client secret"} type="password" value={secret.clientSecret || ""} onChange={value => props.onChange("clientSecret", value, true)} required={!item.credential.configured} hint="Saved once, encrypted, and never shown again." /></div>
      </>}
      {item.provider === "microsoft_platform" && <>
        <ol className="list-decimal space-y-2 pl-5 text-sm"><li>Open <a className="text-blue-700 underline" href="https://entra.microsoft.com/" target="_blank" rel="noreferrer">Microsoft Entra admin center</a> and register the platform Web application.</li><li>Add the exact redirect URI below.</li><li>Use delegated scopes <code>openid profile offline_access User.Read Files.ReadWrite</code>. Broader SharePoint permissions are not requested.</li><li>Create a client secret value and record the verified publisher domain.</li><li>Save, then sign in through Microsoft. Dialoggg performs identity plus temporary write/delete capability checks before company connections are enabled.</li></ol>
        <Callback value={item.callbackUri} />
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Application name" value={form.applicationName || ""} onChange={value => props.onChange("applicationName", value)} onBlur={props.onBlur} /><Field label="Tenant / directory ID" value={form.tenantId || "organizations"} onChange={value => props.onChange("tenantId", value)} onBlur={props.onBlur} /><Field label="Application / client ID" value={form.clientId || ""} onChange={value => props.onChange("clientId", value)} onBlur={props.onBlur} /><Field label="Verified publisher domain" value={form.publisherDomain || ""} onChange={value => props.onChange("publisherDomain", value)} onBlur={props.onBlur} /><Field label={item.credential.configured ? "Replacement client secret value (optional)" : "Client secret value"} type="password" value={secret.clientSecret || ""} onChange={value => props.onChange("clientSecret", value, true)} required={!item.credential.configured} hint="Encrypted at rest and never returned; do not enter a Microsoft password." /></div>
      </>}
      {item.provider === "resend_platform" && <>
        <ol className="list-decimal space-y-2 pl-5 text-sm"><li>Open <a className="text-blue-700 underline" href="https://resend.com/domains" target="_blank" rel="noreferrer">Resend Domains</a>, add the sending domain, and finish every DNS check.</li><li>Create an API key with only the access Dialoggg needs.</li><li>Enter a From address on that exact verified domain plus the support Reply-To.</li><li>Save and Validate. Validation is read-only and checks the key and exact domain.</li><li>Optionally confirm one test email. Dialoggg never sends it automatically.</li></ol>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Verified sending domain" value={form.sendingDomain || ""} onChange={value => props.onChange("sendingDomain", value)} onBlur={props.onBlur} /><Field label="From name" value={form.fromName || ""} onChange={value => props.onChange("fromName", value)} onBlur={props.onBlur} /><Field label="From address" type="email" value={form.fromAddress || ""} onChange={value => props.onChange("fromAddress", value)} onBlur={props.onBlur} /><Field label="Reply-To / support address" type="email" value={form.replyTo || ""} onChange={value => props.onChange("replyTo", value)} onBlur={props.onBlur} /><Field label={item.credential.configured ? "Replacement API key (optional)" : "Resend API key"} type="password" value={secret.apiKey || ""} onChange={value => props.onChange("apiKey", value, true)} required={!item.credential.configured} /><Field label="Webhook signing secret (optional)" type="password" value={secret.webhookSecret || ""} onChange={value => props.onChange("webhookSecret", value, true)} required={false} /></div>
      </>}
      <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm"><strong>Stored credential:</strong> {item.credential.configured ? `configured · fingerprint ${item.credential.fingerprint} · ends ${item.credential.lastFour} · version ${item.credential.version}` : "not configured"}<br /><strong>Saved:</strong> {friendlyTime(item.savedAt)} · <strong>Verified:</strong> {friendlyTime(item.verifiedAt)} · <strong>Environment:</strong> {item.environment}{item.safeStatusCode && <><br /><strong>Safe status:</strong> {item.safeStatusCode}</>}</div>
      <div className="mt-4 flex flex-wrap gap-2"><button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-40" disabled={props.busy} onClick={props.onSave}>{item.credential.configured ? "Save details / replace secret" : "Save credential"}</button><button className="rounded-lg border border-blue-700 px-4 py-2 font-semibold text-blue-800 disabled:opacity-40" disabled={props.busy || !canVerify} onClick={props.onConnect}>{item.provider === "resend_platform" ? "Validate Resend" : `Connect and verify ${item.provider === "google_platform" ? "Google" : "Microsoft"}`}</button>{item.credential.configured && <button className="rounded-lg border border-red-500 px-4 py-2 font-semibold text-red-700" disabled={props.busy} onClick={props.onRevoke}>Revoke credential</button>}</div>
      {item.provider === "resend_platform" && item.status === "verified" && <div className="mt-4 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end"><div className="flex-1"><Field label="Confirmed test recipient" type="email" value={props.testRecipient} onChange={props.onTestRecipient} /></div><button className="rounded-lg border border-green-700 px-4 py-2.5 font-semibold text-green-800" onClick={props.onSendTest}>Confirm and send one test</button></div>}
      <p className="mt-3 text-xs text-slate-500">Non-secret fields autosave when you leave a field. Secret fields are never autosaved.</p>
    </div>
  </details>;
}

function Callback({ value }: { value: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3"><strong className="block text-sm">Exact production redirect URI</strong><code className="mt-1 block break-all text-xs">{value}</code><button className="mt-2 rounded border bg-white px-3 py-1 text-sm" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); }}>Copy callback URI</button>{copied && <span className="ml-2 text-sm" role="status">Copied</span>}</div>;
}

function IntegrationReview({ snapshot, progress }: { snapshot: Snapshot; progress: number }) {
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6"><header className="rounded-2xl bg-slate-950 p-6 text-white"><p className="text-sm font-semibold uppercase tracking-widest text-blue-300">Internal read-only view</p><h1 className="mt-2 text-3xl font-bold">Integration setup status</h1><p className="mt-2 text-slate-200">This page intentionally contains no credential values, OAuth tokens, invitation tokens, or provider response payloads.</p></header><section className="rounded-xl border bg-white p-5"><div className="flex justify-between"><strong>Overall progress</strong><span>{progress}%</span></div><div className="mt-2 h-3 rounded-full bg-slate-200"><div className="h-full rounded-full bg-green-600" style={{ width: `${progress}%` }} /></div><p className="mt-3 text-sm">Scope: {snapshot.invitation.scopeKind}{snapshot.invitation.companyName ? ` · ${snapshot.invitation.companyName}` : ""} · Completed: {friendlyTime(snapshot.invitation.completedAt)}</p></section><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{snapshot.providers.map(item => <article key={item.provider} className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-bold">{LABELS[item.provider]}</h2><StatusBadge status={item.status} /><dl className="mt-4 space-y-2 text-sm"><div><dt className="font-semibold">Environment</dt><dd>{item.environment}</dd></div><div><dt className="font-semibold">Credential</dt><dd>{item.credential.configured ? `Configured · v${item.credential.version} · ${item.credential.fingerprint} · ends ${item.credential.lastFour}` : "Not configured"}</dd></div><div><dt className="font-semibold">Saved</dt><dd>{friendlyTime(item.savedAt)}</dd></div><div><dt className="font-semibold">Verified</dt><dd>{friendlyTime(item.verifiedAt)}</dd></div>{item.safeStatusCode && <div><dt className="font-semibold">Safe status</dt><dd>{item.safeStatusCode}</dd></div>}</dl></article>)}</div></main>;
}
