"use client";

import { useEffect, useState } from "react";

type Snapshot = {
  state: "connection_required" | "connecting" | "healthy" | "paused" | "action_required" | "disconnected";
  pauseReason: string | null;
  companySyncState: string;
  scope: string | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastReconciledAt: string | null;
  lastErrorCode: string | null;
  health: { pending: number; dead: number; managedItems: number };
};

function csrfToken() {
  return document.cookie.split("; ").find(item => item.startsWith("dialoggg_csrf="))?.split("=").slice(1).join("=") || "";
}

function stateLabel(snapshot: Snapshot | null) {
  if (!snapshot) return "Loading";
  if (snapshot.companySyncState === "paused" || snapshot.state === "paused") return "Paused after company restoration";
  if (snapshot.state === "healthy") return "Connected · healthy";
  if (snapshot.state === "action_required") return "Action needed";
  if (snapshot.state === "connecting") return "Connecting";
  return "Not connected";
}

export default function GoogleCalendarManager({ email, role }: { email: string; role: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dialog, setDialog] = useState<"connect" | "disconnect" | "resume" | "payload" | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [disconnectMode, setDisconnectMode] = useState<"remove" | "retain">("remove");
  const [message, setMessage] = useState("Loading synchronization health…");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/google-calendar", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error?.message || "Google Calendar status is unavailable."); return; }
    setSnapshot(result.data); setMessage("");
  }
  useEffect(() => { void load(); }, []);

  async function action(name: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setMessage("Updating Google Calendar delivery…");
    try {
      const response = await fetch("/api/google-calendar", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken() }, body: JSON.stringify({ action: name, ...extra }) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error?.message || "The Google Calendar action failed."); await load(); return; }
      if (result.data?.authorizationUrl) { window.location.assign(result.data.authorizationUrl); return; }
      setSnapshot(result.data); setDialog(null); setAccepted(false);
      setMessage(name === "disconnect" ? `Disconnected. ${extra.mode === "retain" ? "Existing managed items were retained as stale copies." : "Managed Google items were removed where safe."}` : name === "resume" ? "Synchronization resumed after explicit health review." : "Reconciliation completed or was safely queued.");
    } finally { setBusy(false); }
  }

  const current = stateLabel(snapshot);
  const canResume = role.includes("Owner") || role.includes("Admin");
  return <div className="space-y-6" data-google-calendar-ready={snapshot ? "true" : "false"}>
    <header><p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Personal one-way schedule delivery</p><h1 className="text-3xl font-bold">Google Calendar</h1><p className="mt-2 text-slate-600">Synchronization is one-way: Dialoggg → Google. Dialoggg stays the source of truth, Google edits are not imported, and nothing is written to your primary Google calendar.</p></header>

    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Your dedicated Dialoggg calendar</h2><p className="mt-1 text-sm text-slate-600">Signed in as {email} · Current Role: {role}</p></div><span className={`rounded-full px-3 py-1 text-sm font-bold ${current === "Connected · healthy" ? "bg-emerald-100 text-emerald-900" : current.includes("Paused") ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-800"}`}>{current}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Managed items" value={String(snapshot?.health.managedItems ?? 0)} /><Metric label="Pending/retry" value={String(snapshot?.health.pending ?? 0)} /><Metric label="Dead letters" value={String(snapshot?.health.dead ?? 0)} /></div>
      <p className="mt-4 text-sm">Dialoggg creates and manages one dedicated calendar named <strong>Dialoggg</strong> in Google Calendar. It uses Google default reminders and the least-privilege <code>calendar.app.created</code> scope.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(!snapshot || ["connection_required", "disconnected"].includes(snapshot.state)) && <button disabled={busy} onClick={() => { setAccepted(false); setDialog("connect"); }} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white">Connect Google Calendar</button>}
        {snapshot?.state === "action_required" && <><button disabled={busy} onClick={() => { setAccepted(false); setDialog("connect"); }} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white">Reconnect Google Calendar</button><button disabled={busy} onClick={() => void action("retry")} className="rounded border px-4 py-2 text-sm font-bold">Retry queued changes</button></>}
        {snapshot?.state === "healthy" && <><button disabled={busy} onClick={() => void action("sync_now")} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white">Sync now</button><button disabled={busy} onClick={() => { setAccepted(false); setDialog("disconnect"); }} className="rounded border border-red-300 px-4 py-2 text-sm font-bold text-red-800">Disconnect</button></>}
        {(snapshot?.companySyncState === "paused" || snapshot?.state === "paused") && canResume && <button disabled={busy} onClick={() => setDialog("resume")} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white">Review and resume</button>}
        <button data-testid="google-item-preview" onClick={() => setDialog("payload")} className="rounded border px-4 py-2 text-sm font-bold">Preview safe Google item</button>
      </div>
      {snapshot?.lastErrorCode && <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Actionable health:</strong> {snapshot.lastErrorCode}. Consent may have been revoked, permission may be missing, or Google may be unavailable. No token details are exposed.</div>}
      <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-700">{message}</p>
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Delivery rules</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700"><li>Owner, Admin, and Employee (Internal) delivery follows the assigned Resource linked one-to-one to the User.</li><li>External/Client delivery includes only externally visible Tasks and Events in assigned Projects.</li><li>Master-only internal Events are never included for External/Client Users.</li><li>When an assignment changes, the old linked User&apos;s managed item is removed and the new User receives a mapped item.</li><li>Titles contain Project Name — Task/Event Name; client email, phone, site address, internal notes, dependency lag, private Resource details, and Microsoft links are excluded.</li></ul></div>
      <div className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Synchronization health</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700"><li>Normal delivery target: within two minutes through the outbox worker.</li><li>Every source has one stable mapping; an existing mapped item is updated and retries never create duplicate Google items.</li><li>Deletion or lost eligibility removes the managed copy; Google 404 cleanup is treated as complete.</li><li>429, provider, and network failures use exponential backoff with jitter and retry automatically for up to 24 hours before dead-lettering.</li><li>Company restoration stays paused until an Owner/Admin explicitly reviews health and resumes reconciliation.</li></ul><p className="mt-3 text-xs text-slate-500">Last successful reconciliation: {snapshot?.lastReconciledAt ? new Date(snapshot.lastReconciledAt).toLocaleString() : "Never"}</p></div>
    </section>

    {dialog === "connect" && <Modal title="Connect Google Calendar" onClose={() => setDialog(null)}><div className="space-y-3 p-5 text-sm"><p>You will authorize your own Google account. Dialoggg never asks for your Google password.</p><p>Google will allow Dialoggg to create and manage one dedicated calendar and its events using the narrow <code>calendar.app.created</code> scope.</p><label className="flex gap-3 rounded border bg-blue-50 p-3"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>I understand this is a personal connection and Dialoggg remains the source of truth.</span></label></div><Footer><button onClick={() => setDialog(null)} className="rounded border px-4 py-2 text-sm font-bold">Cancel</button><button disabled={!accepted || busy} onClick={() => void action("oauth_start")} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Continue to Google</button></Footer></Modal>}
    {dialog === "disconnect" && <Modal title="Disconnect Google Calendar?" alert onClose={() => setDialog(null)}><div className="space-y-3 p-5 text-sm"><fieldset><legend className="font-bold">Existing managed Google items</legend><label className="mt-2 block rounded border p-3"><input type="radio" name="disconnect" checked={disconnectMode === "remove"} onChange={() => setDisconnectMode("remove")} className="mr-2"/><strong>Remove managed items</strong><span className="block pl-5 text-xs">Delete the dedicated calendar where safe.</span></label><label className="mt-2 block rounded border p-3"><input type="radio" name="disconnect" checked={disconnectMode === "retain"} onChange={() => setDisconnectMode("retain")} className="mr-2"/><strong>Retain existing items</strong><span className="block pl-5 text-xs">Items remain in Google as stale copies and receive no future updates.</span></label></fieldset><label className="flex gap-3 rounded border border-red-200 bg-red-50 p-3"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>I understand synchronization stops immediately for this connection.</span></label></div><Footer><button onClick={() => setDialog(null)} className="rounded border px-4 py-2 text-sm font-bold">Cancel</button><button disabled={!accepted || busy} onClick={() => void action("disconnect", { mode: disconnectMode, confirmed: true })} className="rounded bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Disconnect Google Calendar</button></Footer></Modal>}
    {dialog === "resume" && <Modal title="Resume Google synchronization?" alert onClose={() => setDialog(null)}><div className="space-y-3 p-5 text-sm"><p>The company is active again. Restoration alone never resumes synchronization.</p><ul className="list-disc pl-5"><li>Stored consent and dedicated calendar are checked during reconciliation.</li><li>Pending changes reuse stable mappings.</li><li>Transient failures retain their 24-hour retry window.</li></ul></div><Footer><button onClick={() => setDialog(null)} className="rounded border px-4 py-2 text-sm font-bold">Keep paused</button><button disabled={busy} onClick={() => void action("resume", { confirmed: true })} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white">Resume synchronization</button></Footer></Modal>}
    {dialog === "payload" && <Modal title="Safe Google item preview" onClose={() => setDialog(null)}><div className="space-y-3 p-5 text-sm"><p className="font-bold">Reading Residence Court — Client walkthrough</p><p>Managed by Dialoggg. Google edits will not be saved. Make schedule changes in Dialoggg.</p><p>Sep 22, 2:00–3:00 PM · America/New_York · Google default reminders</p><p className="rounded border border-emerald-200 bg-emerald-50 p-3"><strong>Excluded:</strong> client email, phone, site address, internal notes, dependency lag, private Resource details, and Microsoft links.</p></div><Footer><button onClick={() => setDialog(null)} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white">Close preview</button></Footer></Modal>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div>; }
function Modal({ title, children, onClose, alert = false }: { title: string; children: React.ReactNode; onClose(): void; alert?: boolean }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title}><div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl bg-white shadow-xl"><header className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} aria-label={`Close ${title}`}>×</button></header>{children}</div></div>; }
function Footer({ children }: { children: React.ReactNode }) { return <footer className="flex justify-end gap-2 border-t px-5 py-4">{children}</footer>; }
