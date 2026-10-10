"use client";

import { useEffect, useState } from "react";
import HowItWorks from "@/components/HowItWorks";

const GOOGLE_CALENDAR_GUIDE = [
  "See your Dialoggg schedule in your own Google Calendar, right next to everything else, including on your phone.",
  "Dialoggg adds one separate calendar named ‘Dialoggg’ to your Google account. Your own calendars and events are never read or changed.",
  "You see the tasks and events assigned to you. Owners, Admins, and Employees need to be linked to a resource (Resources, then Link User), or nothing will show up. Clients see only what’s shared with them.",
  "Example: an installer is assigned ‘Install Court Base’ on Smith Residence. It appears on his phone as ‘Smith Residence — Install Court Base.’ If the dates move in the Project Plan, it moves in Google.",
  "It’s one-way. Changes in Dialoggg show up in Google. Changes made in Google are not saved, so make all edits in Dialoggg.",
] as const;

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

type GoogleItemPreview = {
  sourceType: "task" | "event";
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string;
  reminders: "Google default reminders";
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
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [troubleshootingOpen, setTroubleshootingOpen] = useState(false);
  const [preview, setPreview] = useState<GoogleItemPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

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
      if (!response.ok) { setMessage(result.error?.message || "The Google Calendar action failed."); return; }
      if (result.data?.authorizationUrl) { window.location.assign(result.data.authorizationUrl); return; }
      setSnapshot(result.data); setDialog(null); setAccepted(false);
      setMessage(name === "disconnect" ? `Disconnected. ${extra.mode === "retain" ? "Existing managed items were retained as stale copies." : "Managed Google items were removed where safe."}` : name === "resume" ? "Synchronization resumed after explicit health review." : "Reconciliation completed or was safely queued.");
    } finally { setBusy(false); }
  }

  async function openPreview() {
    setDialog("payload");
    setPreview(null);
    setPreviewError("");
    setPreviewLoading(true);
    try {
      const response = await fetch("/api/google-calendar/preview", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "The Google Calendar preview is unavailable.");
      setPreview(result.data ?? null);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "The Google Calendar preview is unavailable.");
    } finally {
      setPreviewLoading(false);
    }
  }

  const current = stateLabel(snapshot);
  const canResume = role.includes("Owner") || role.includes("Admin");
  const notConnected = !snapshot || ["connection_required", "disconnected"].includes(snapshot.state);
  const connectedStatus = snapshot?.state === "healthy" ? "Connected" : snapshot?.state === "connecting" ? "Connecting" : snapshot?.state === "action_required" ? "Action needed" : current;
  const connectedStatusStyle = snapshot?.state === "healthy" ? "bg-emerald-100 text-emerald-900" : snapshot?.state === "connecting" ? "bg-blue-100 text-blue-900" : "bg-amber-100 text-amber-900";
  return <div className="space-y-6" data-google-calendar-ready={snapshot ? "true" : "false"}>
    {notConnected ? <>
      <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold">Google Calendar</h1><p className="mt-2 text-slate-600">See your Dialoggg schedule in your own Google Calendar.</p></div><span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-bold text-slate-700">Not connected</span></header>
      <HowItWorks items={GOOGLE_CALENDAR_GUIDE} />

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="google-connect-title">
        <h2 id="google-connect-title" className="text-xl font-bold">Connect Google Calendar <span className="text-sm font-normal text-slate-500">· about 1 minute</span></h2>
        <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
          <li className="flex gap-3"><NumberedStep>1</NumberedStep><span>Click Connect Google Calendar below.</span></li>
          <li className="flex gap-3"><NumberedStep>2</NumberedStep><span>Sign in with your Google account. Gmail works, and so does a Google Workspace account.</span></li>
          <li className="flex gap-3"><NumberedStep>3</NumberedStep><span>Approve the request. Dialoggg asks only for permission to create and manage its own calendar.</span></li>
          <li className="flex gap-3"><NumberedStep>4</NumberedStep><span>Done. A calendar named Dialoggg appears in Google Calendar, usually within a few minutes.</span></li>
        </ol>
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><strong className="text-slate-800">You’ll need:</strong> a Google account. Each person connects their own. It isn’t a company-wide setting.</p>
        <button disabled={busy} onClick={() => { setAccepted(false); setDialog("connect"); }} className="mt-4 min-h-11 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">Connect Google Calendar</button>
        {message && <p role={message.includes("failed") || message.includes("unavailable") || message.includes("required") ? "alert" : "status"} aria-live="polite" className={`mt-3 rounded-lg border p-3 text-sm font-semibold ${message.includes("failed") || message.includes("unavailable") || message.includes("required") ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-950"}`}>{message}</p>}
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Google Calendar privacy details">
        <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold">What goes to Google</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700"><li>Project name and task or event name</li><li>Dates and times</li><li>Only items assigned to you</li></ul></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold">What never goes to Google</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700"><li>Client name, email, phone, or site address</li><li>Internal notes and pricing</li><li>Microsoft folder links</li></ul></div>
      </section>
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Your other calendars are safe.</strong> Dialoggg can only see and change the one calendar it creates. It can’t read your other Google calendars or events.</p>
    </> : <>
      <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold">Google Calendar</h1><p className="mt-2 text-slate-600">See your Dialoggg schedule in your own Google Calendar.</p></div><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${connectedStatusStyle}`}><span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />{connectedStatus}</span></header>
      <HowItWorks items={GOOGLE_CALENDAR_GUIDE} />

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="connected-calendar-title">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="connected-calendar-title" className="text-xl font-bold">Your Dialoggg calendar</h2><p className="mt-1 text-sm text-slate-600">Signed in as {email}</p></div></div>
        <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3">
          <Metric label="Status" value={snapshot?.state === "healthy" ? "Up to date" : snapshot?.state === "connecting" ? "Connecting" : connectedStatus} tone={snapshot?.state === "healthy" ? "success" : "default"} />
          <Metric label="Last updated" value={formatLastUpdated(snapshot?.lastSuccessAt ?? null)} />
          <Metric label="Items in Google" value={String(snapshot?.health.managedItems ?? 0)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {snapshot?.state === "healthy" && <><button disabled={busy} onClick={() => void action("sync_now")} className="min-h-10 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">Sync now</button><button disabled={busy} onClick={() => { setAccepted(false); setDialog("disconnect"); }} className="min-h-10 rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-800">Disconnect</button><span className="ml-1 text-xs text-slate-500">Changes usually appear in Google within a few minutes.</span></>}
          {snapshot?.state === "action_required" && <><button disabled={busy} onClick={() => { setAccepted(false); setDialog("connect"); }} className="min-h-10 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white">Reconnect Google Calendar</button><button disabled={busy} onClick={() => void action("retry")} className="min-h-10 rounded-lg border px-4 py-2 text-sm font-bold">Retry queued changes</button></>}
          {(snapshot?.companySyncState === "paused" || snapshot?.state === "paused") && canResume && <button disabled={busy} onClick={() => setDialog("resume")} className="min-h-10 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white">Review and resume</button>}
        </div>
        {message && <p role={message.includes("failed") || message.includes("unavailable") || message.includes("required") ? "alert" : "status"} aria-live="polite" className={`mt-3 rounded-lg border p-3 text-sm font-semibold ${message.includes("failed") || message.includes("unavailable") || message.includes("required") ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-950"}`}>{message}</p>}
        {canResume && <section className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <button type="button" aria-expanded={troubleshootingOpen} aria-controls="google-troubleshooting-panel" onClick={() => setTroubleshootingOpen(open => !open)} className="flex min-h-11 w-full items-center justify-between gap-4 bg-slate-50 px-4 py-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-inset">
            <span>Troubleshooting details (Owners and Admins)</span>
            <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white transition-transform duration-300 ease-in-out ${troubleshootingOpen ? "rotate-180" : "rotate-0"}`}><svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5" /></svg></span>
          </button>
          <div id="google-troubleshooting-panel" aria-hidden={!troubleshootingOpen} inert={!troubleshootingOpen} className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${troubleshootingOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="min-h-0 overflow-hidden"><div className="space-y-2 border-t border-slate-200 p-4 text-sm text-slate-600"><p>Last updated: {formatLastUpdated(snapshot?.lastSuccessAt ?? null)}</p><p>Pending/retry: {snapshot?.health.pending ?? 0} · Dead letters: {snapshot?.health.dead ?? 0}</p><p>Last reconciliation: {snapshot?.lastReconciledAt ? new Date(snapshot.lastReconciledAt).toLocaleString() : "Never"}</p>{snapshot?.scope && <p>Google permission: <code>{snapshot.scope}</code></p>}{snapshot?.lastErrorCode && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">{snapshot.lastErrorCode}{snapshot.pauseReason ? ` · ${snapshot.pauseReason}` : ""}. No token details are exposed.</p>}<button data-testid="google-item-preview" onClick={() => void openPreview()} className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">Preview safe Google item</button></div></div>
          </div>
        </section>}
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Google Calendar privacy details">
        <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-emerald-700">What goes to Google</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700"><li>Project name and task or event name</li><li>Dates and times</li><li>Only items assigned to you</li></ul></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-rose-700">What never goes to Google</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700"><li>Client name, email, phone, or site address</li><li>Internal notes and pricing</li><li>Microsoft folder links</li></ul></div>
      </section>
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Your other calendars are safe.</strong> Dialoggg can only see and change the one calendar it creates. It can’t read your other Google calendars or events.</p>
    </>}

    {dialog === "connect" && <Modal title="Connect Google Calendar" onClose={() => setDialog(null)}><div className="space-y-3 p-5 text-sm"><p>You will authorize your own Google account. Dialoggg never asks for your Google password.</p><p>Google will allow Dialoggg to create and manage one dedicated calendar and its events using the narrow <code>calendar.app.created</code> scope.</p><label className="flex gap-3 rounded border bg-blue-50 p-3"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>I understand this is a personal connection and Dialoggg remains the source of truth.</span></label></div><Footer><button onClick={() => setDialog(null)} className="rounded border px-4 py-2 text-sm font-bold">Cancel</button><button disabled={!accepted || busy} onClick={() => void action("oauth_start")} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Continue to Google</button></Footer></Modal>}
    {dialog === "disconnect" && <Modal title="Disconnect Google Calendar?" alert onClose={() => setDialog(null)}><div className="space-y-3 p-5 text-sm"><fieldset><legend className="font-bold">Existing managed Google items</legend><label className="mt-2 block rounded border p-3"><input type="radio" name="disconnect" checked={disconnectMode === "remove"} onChange={() => setDisconnectMode("remove")} className="mr-2"/><strong>Remove managed items</strong><span className="block pl-5 text-xs">Delete the dedicated calendar where safe.</span></label><label className="mt-2 block rounded border p-3"><input type="radio" name="disconnect" checked={disconnectMode === "retain"} onChange={() => setDisconnectMode("retain")} className="mr-2"/><strong>Retain existing items</strong><span className="block pl-5 text-xs">Items remain in Google as stale copies and receive no future updates.</span></label></fieldset><label className="flex gap-3 rounded border border-red-200 bg-red-50 p-3"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>I understand synchronization stops immediately for this connection.</span></label></div><Footer><button onClick={() => setDialog(null)} className="rounded border px-4 py-2 text-sm font-bold">Cancel</button><button disabled={!accepted || busy} onClick={() => void action("disconnect", { mode: disconnectMode, confirmed: true })} className="rounded bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Disconnect Google Calendar</button></Footer></Modal>}
    {dialog === "resume" && <Modal title="Resume Google synchronization?" alert onClose={() => setDialog(null)}><div className="space-y-3 p-5 text-sm"><p>The company is active again. Restoration alone never resumes synchronization.</p><ul className="list-disc pl-5"><li>Stored consent and dedicated calendar are checked during reconciliation.</li><li>Pending changes reuse stable mappings.</li><li>Transient failures retain their 24-hour retry window.</li></ul></div><Footer><button onClick={() => setDialog(null)} className="rounded border px-4 py-2 text-sm font-bold">Keep paused</button><button disabled={busy} onClick={() => void action("resume", { confirmed: true })} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white">Resume synchronization</button></Footer></Modal>}
    {dialog === "payload" && <Modal title="Safe Google item preview" onClose={() => setDialog(null)}><div className="space-y-3 p-5 text-sm">{previewLoading ? <p role="status" className="rounded border bg-slate-50 p-3">Finding your next scheduled item eligible for Google delivery…</p> : previewError ? <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-900">{previewError}</p> : preview ? <><div className="rounded-lg border bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Actual Dialoggg {preview.sourceType === "task" ? "Task" : "Event"}</p><p className="mt-1 font-bold">{preview.title}</p><p className="mt-4 text-xs font-bold uppercase text-slate-500">Timing and reminders</p><p className="mt-1">{formatPreviewSchedule(preview)} · {preview.reminders}</p></div><p className="text-xs text-slate-600">This is the next upcoming item currently eligible for your account, using the same assignment and visibility rules as delivery.</p></> : <p className="rounded border bg-slate-50 p-3">No upcoming Tasks or Events are currently eligible for delivery to your account. Assign a Task to your linked Resource or add a visible Event, then preview again.</p>}<p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-950"><strong>Privacy:</strong> client email, phone, site address, internal notes, dependency lag, private Resource details, and Microsoft links are excluded. This preview is read-only and does not write anything to Google.</p></div><Footer><button onClick={() => setDialog(null)} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white">Close preview</button></Footer></Modal>}
  </div>;
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" }) { return <div className={`p-3 ${tone === "success" ? "bg-emerald-50" : "bg-slate-50"}`}><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className={`mt-1 text-lg font-bold ${tone === "success" ? "text-emerald-700" : "text-slate-900"}`}>{value}</p></div>; }
function NumberedStep({ children }: { children: React.ReactNode }) { return <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">{children}</span>; }
function formatLastUpdated(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  const today = new Date();
  return date.toDateString() === today.toDateString() ? `Today, ${time}` : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
function formatPreviewSchedule(preview: GoogleItemPreview) {
  const dateOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", timeZone: preview.allDay ? "UTC" : preview.timeZone };
  if (preview.allDay) {
    const start = new Date(`${preview.start.slice(0, 10)}T00:00:00Z`);
    const exclusiveEnd = new Date(`${preview.end.slice(0, 10)}T00:00:00Z`);
    const lastDay = new Date(exclusiveEnd.getTime() - 86_400_000);
    const format = (value: Date) => new Intl.DateTimeFormat("en-US", dateOptions).format(value);
    return `${format(start)}${format(start) === format(lastDay) ? "" : `–${format(lastDay)}`} · All day`;
  }
  const timeOptions: Intl.DateTimeFormatOptions = { ...dateOptions, hour: "numeric", minute: "2-digit" };
  const format = (value: string) => new Intl.DateTimeFormat("en-US", timeOptions).format(new Date(value));
  return `${format(preview.start)}–${format(preview.end)} · ${preview.timeZone}`;
}
function Modal({ title, children, onClose, alert = false }: { title: string; children: React.ReactNode; onClose(): void; alert?: boolean }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title}><div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl bg-white shadow-xl"><header className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} aria-label={`Close ${title}`}>×</button></header>{children}</div></div>; }
function Footer({ children }: { children: React.ReactNode }) { return <footer className="flex justify-end gap-2 border-t px-5 py-4">{children}</footer>; }
