"use client";

import { useEffect, useState } from "react";
import TimedNotice from "@/components/TimedNotice";
import HowItWorks from "@/components/HowItWorks";

const MICROSOFT_STORAGE_GUIDE = [
  "Dialoggg keeps your schedule. Your files stay in your own Microsoft account. Drawings, photos, permits, and contracts live in your OneDrive or SharePoint. Dialoggg adds a link to a job so people working on it can open the right page. No one at Dialoggg can see your files in the same place.",
  "Every project has two folders. Common is for files you share with the job: drawings, photos, specs. Private is for internal files like pricing and notes. Only Owners and Admins see the Private link.",
  "Example: for “Smith Residence,” open the project and click Common to see the drawings and site photos. An installer assigned to the job opens the same folder from his phone. Your pricing sheet stays in Private, and he never sees it.",
  "Dialoggg never stores, renames, or deletes your files. Completing or archiving a project leaves its folders alone.",
] as const;

type Snapshot = {
  state: "healthy" | "connection_required" | "permission_denied" | "error" | "disconnected";
  serviceType: "onedrive_business" | "sharepoint" | null;
  display: { accountName: string; siteName: string | null; driveName: string; rootName: string } | null;
  grantedScope: string | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastErrorCode: string | null;
  platform: { configured: boolean; status: string; safeStatusCode: string | null; disabled: boolean };
};

type Choice = { choice: string; name: string };
type Dialog = "connect" | "root" | "disconnect" | null;

function csrfToken() {
  return document.cookie.split("; ").find(item => item.startsWith("dialoggg_csrf="))?.split("=").slice(1).join("=") || "";
}

function Modal({ title, alert = false, darkBackdrop = false, children, close }: { title: string; alert?: boolean; darkBackdrop?: boolean; children: React.ReactNode; close: () => void }) {
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; document.addEventListener("keydown", key); return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); }; }, [close]);
  return <div className={`fixed inset-0 z-[80] flex items-center justify-center p-4 ${darkBackdrop ? "" : "bg-slate-950/55"}`} style={darkBackdrop ? { backgroundColor: "rgba(3, 7, 18, 0.78)" } : undefined} onMouseDown={close}><section role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}><header className="sticky top-0 flex items-center justify-between border-b bg-blue-900 px-5 py-4 text-white"><h2 className="text-lg font-bold">{title}</h2><button type="button" aria-label={`Close ${title}`} onClick={close} className="rounded px-2 text-2xl hover:bg-white/15">×</button></header>{children}</section></div>;
}

export default function MicrosoftStoragePrototype({ companyName }: { companyName: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [storage, setStorage] = useState<"onedrive_business" | "sharepoint">("onedrive_business");
  const [sharepointHost, setSharepointHost] = useState("");
  const [sharepointPath, setSharepointPath] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [choice, setChoice] = useState("");

  async function load() {
    const response = await fetch("/api/microsoft-storage", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) { setNotice(result.error?.message || "Microsoft Storage is unavailable."); return; }
    setSnapshot(result.data); setStorage(result.data.serviceType || "onedrive_business"); setNotice("");
  }

  useEffect(() => { void load(); }, []);
  const close = () => { setDialog(null); setAccepted(false); setChoices([]); setChoice(""); };

  async function action(name: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setNotice("Updating Microsoft Storage…");
    try {
      const response = await fetch("/api/microsoft-storage", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ action: name, ...extra }),
      });
      const result = await response.json();
      if (!response.ok) { setNotice(result.error?.message || "Microsoft Storage could not be updated."); return null; }
      if (result.data?.authorizationUrl) { window.location.assign(result.data.authorizationUrl); return result.data; }
      if (result.data?.choices) { const next = result.data.choices as Choice[]; setChoices(next); setChoice(next[0]?.choice || ""); setNotice(""); return result.data; }
      setSnapshot(result.data); setNotice(name === "disconnect" ? "Microsoft Storage disconnected. No Microsoft folder, file, or permission was deleted." : name === "select_root" ? "Company root changed for future automatic folder creation. Existing Project folders were not moved." : "Microsoft Storage health verified."); close(); return result.data;
    } finally { setBusy(false); }
  }

  async function openRootDialog() {
    setDialog("root"); setAccepted(false); setChoices([]); setChoice("");
    await action("root_choices");
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "microsoft" && params.get("status") === "verified") void openRootDialog();
  }, []);

  const connected = snapshot?.state === "healthy";
  const attention = !!snapshot && !connected && snapshot.state !== "connection_required" && snapshot.state !== "disconnected";
  const platformReady = snapshot?.platform.configured && snapshot.platform.status === "verified" && !snapshot.platform.disabled;
  const healthLabel = connected ? "Connected · healthy" : attention ? "Action needed" : "Not connected";
  const showSetup = !snapshot || snapshot.state === "connection_required" || snapshot.state === "disconnected";
  return <div className="mx-auto max-w-6xl space-y-5 pb-10" data-microsoft-storage-ready="true">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold text-slate-950">Microsoft Storage</h1><p className="mt-1 text-sm leading-6 text-slate-600">Link each job to its shared folders in your Microsoft OneDrive or SharePoint.</p><span className="mt-2 inline-flex rounded border border-lime-700 bg-[#1c2c22] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-lime-300">Optional: Dialoggg never stores your files</span></div><span className={`mt-1 rounded-full px-3 py-1.5 text-xs font-bold ${connected ? "bg-emerald-100 text-emerald-900" : attention ? "bg-amber-100 text-amber-950" : "bg-slate-200 text-slate-800"}`}>{healthLabel}</span></header>
    <HowItWorks items={MICROSOFT_STORAGE_GUIDE} />
    {notice && <TimedNotice message={notice} duration={notice.startsWith("Updating") ? 0 : undefined} tone={notice.includes("could not") || notice.includes("unavailable") ? "error" : "info"} onDismiss={() => setNotice("")} />}
    {!platformReady && showSetup && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Platform Microsoft application is not ready.</strong><p className="mt-1">A Platform Administrator must save and verify the permanent Microsoft OAuth / Graph application settings before this company can connect.</p></section>}
    {showSetup ? <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="connect-storage-heading">
      <div className="flex flex-wrap items-start justify-between gap-1"><div><h2 id="connect-storage-heading" className="text-lg font-bold text-slate-900">Connect Microsoft Storage <span className="text-sm font-normal text-slate-500">· about 5 minutes</span></h2><p className="mt-1 text-xs text-slate-500">An Owner or Admin does this once for the whole company.</p></div></div>
      <ol className="mt-4 space-y-2 text-xs leading-5 text-slate-700">
        <SetupStep number="1">Click Connect Microsoft Storage below.</SetupStep>
        <SetupStep number="2">Choose OneDrive for Business (or SharePoint if your company uses a shared library).</SetupStep>
        <SetupStep number="3">Sign in with your work Microsoft account and approve. If Microsoft asks for administrator approval, ask whoever manages your Microsoft 365 account.</SetupStep>
        <SetupStep number="4">After Microsoft sign-in, choose the company folder where new project folders should be created. You can change it later.</SetupStep>
        <SetupStep number="5">When adding a Project, choose whether to create its Common and Private folders below that location. You can also create or link folders later from the Project&apos;s Common and Private tab.</SetupStep>
      </ol>
      <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] leading-4 text-slate-600"><strong className="text-slate-800">You&apos;ll need:</strong> a work or school Microsoft 365 account with OneDrive for Business or SharePoint. Personal OneDrive isn&apos;t supported.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={!platformReady} onClick={() => { setDialog("connect"); setAccepted(false); }} className="min-h-10 rounded-md bg-orange-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Connect Microsoft Storage</button><span className="text-[10px] text-slate-500">Only Owners and Admins can connect.</span></div>
    </section> : <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="company-storage-heading">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{companyName}</p><h2 id="company-storage-heading" className="mt-1 text-lg font-bold text-slate-900">{snapshot?.display?.driveName} / {snapshot?.display?.rootName}</h2><p className="mt-1 text-xs text-slate-600">{snapshot?.serviceType === "sharepoint" ? "SharePoint document library" : "OneDrive for Business"} · {snapshot?.display?.accountName}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setDialog("connect"); setAccepted(false); }} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold">Reconnect</button><button type="button" onClick={() => void openRootDialog()} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold">Change root</button><button type="button" onClick={() => { setDialog("disconnect"); setAccepted(false); }} className="rounded-md border border-red-300 px-3 py-2 text-xs font-bold text-red-800">Disconnect</button>{attention && <button type="button" disabled={busy} onClick={() => void action("retry")} className="rounded-md border border-amber-500 px-3 py-2 text-xs font-bold">Retry health check</button>}</div></div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2"><Info label="Service" value={snapshot?.serviceType === "sharepoint" ? "SharePoint document library" : "OneDrive for Business"}/><Info label="Connection scope" value="One company"/><Info label="New Project folders" value="Create below selected root"/><Info label="Existing Projects" value="May link existing folders"/></dl>
      {attention && <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">Microsoft access needs attention. Consent may be revoked or the saved site, library, or root identifier may no longer be reachable. Existing Microsoft folders remain untouched.</p>}
    </section>}
    <section className="grid gap-3 sm:grid-cols-2" aria-label="Common and Private folders">
      <div className="rounded-lg border border-slate-200 bg-white p-3"><span className="mb-2 block h-4 w-4 rounded-sm bg-lime-500" aria-hidden="true"/><h2 className="text-sm font-bold text-slate-900">Common folder</h2><p className="mt-1 text-xs leading-5 text-slate-600">Shared with the job. Drawings, photos, and specs everyone on the project needs.</p><p className="mt-2 text-[10px] font-bold text-lime-300">Seen by: Owners, Admins, and people assigned to the project</p></div>
      <div className="rounded-lg border border-slate-200 bg-white p-3"><span className="mb-2 block h-4 w-4 rounded-sm bg-orange-600" aria-hidden="true"/><h2 className="text-sm font-bold text-slate-900">Private folder</h2><p className="mt-1 text-xs leading-5 text-slate-600">Internal only. Pricing, margins, and notes that stay with your office.</p><p className="mt-2 text-[10px] font-bold text-orange-700">Seen by: Owners and Admins only</p></div>
    </section>
    {dialog === "connect" && <Modal title={connected ? "Reconnect Microsoft Storage" : "Connect Microsoft Storage"} darkBackdrop close={close}>
      <div className="space-y-4 p-5 text-sm">
        <p className="leading-6 text-slate-600">Choose where your company files live. You&apos;ll sign in with Microsoft on the next screen. Only an Owner or Admin can do this.</p>
        <fieldset className="space-y-2">
          <legend className="mb-2 font-bold text-slate-800">Where do your company files live?</legend>
          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${storage === "onedrive_business" ? "border-orange-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-400"}`}>
            <input type="radio" name="storage" checked={storage === "onedrive_business"} onChange={() => setStorage("onedrive_business")} className="mt-1 h-4 w-4 shrink-0 accent-orange-600" />
            <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 font-bold text-slate-800">OneDrive for Business <span className="rounded border border-lime-500 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-4 text-lime-300">Not sure? Choose this</span></span><span className="mt-1 block text-xs leading-5 text-slate-500">Your work or school Microsoft account. Personal OneDrive isn&apos;t supported.</span></span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${storage === "sharepoint" ? "border-orange-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-400"}`}>
            <input type="radio" name="storage" checked={storage === "sharepoint"} onChange={() => setStorage("sharepoint")} className="mt-1 h-4 w-4 shrink-0 accent-orange-600" />
            <span className="min-w-0"><span className="font-bold text-slate-800">SharePoint document library</span><span className="mt-1 block text-xs leading-5 text-slate-500">A shared company library, for example &quot;Your Company / Projects.&quot; Ask whoever manages your Microsoft 365 account if you&apos;re unsure.</span></span>
          </label>
        </fieldset>
        {storage === "sharepoint" && <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"><Field label="SharePoint hostname" value={sharepointHost} onChange={setSharepointHost} placeholder="contoso.sharepoint.com"/><Field label="Site path" value={sharepointPath} onChange={setSharepointPath} placeholder="sites/Operations"/></div>}
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="h-4 w-4 shrink-0 accent-orange-600"/><span className="text-sm text-slate-700">I understand I control who can open these folders in Microsoft.</span></label>
        <p className="text-xs leading-5 text-slate-500">What happens next: you&apos;ll sign in to Microsoft, approve the connection, and then choose the folder where new project folders are created.</p>
      </div>
      <Actions disabled={busy || !accepted || (storage === "sharepoint" && (!sharepointHost || !sharepointPath))} cancel={close} confirm="Continue to Microsoft" action={() => void action("oauth_start", { serviceType: storage, sharepointHost, sharepointPath })}/>
    </Modal>}
    {dialog === "root" && <Modal title="Change company folder root?" alert close={close}><div className="space-y-4 p-5 text-sm"><p>The selected root controls where <strong>future automatically created</strong> Common and Private folders are placed.</p><div className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-950"><strong>Existing Project folders do not move.</strong><p className="mt-1">Their stable Microsoft item IDs remain linked. Dialoggg never renames, moves, or deletes them automatically.</p></div><label htmlFor="root-choice" className="block font-bold">New root location</label><select id="root-choice" className="min-h-11 w-full rounded border px-3" value={choice} onChange={event => setChoice(event.target.value)}>{choices.length ? choices.map(item => <option key={item.choice} value={item.choice}>{item.name}</option>) : <option value="">Loading available folders…</option>}</select><label className="flex items-start gap-3 rounded border p-3"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1"/><span>I understand this affects only future automatic folder creation.</span></label></div><Actions disabled={busy || !accepted || !choice} cancel={close} confirm="Change root" action={() => void action("select_root", { choice, confirmed: true })}/></Modal>}
    {dialog === "disconnect" && <Modal title="Disconnect Microsoft Storage?" alert close={close}><div className="space-y-4 p-5 text-sm"><p>Common and Private links will become unavailable in Dialoggg until an Owner/Admin reconnects.</p><div className="rounded border border-red-200 bg-red-50 p-3 text-red-950"><strong>Microsoft data is preserved.</strong><p className="mt-1">Disconnecting removes no folder, file, permission, or Microsoft audit history. Stored folder references remain company-scoped for safe reconnection.</p></div><label className="flex items-start gap-3 rounded border p-3"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1"/><span>I understand Dialoggg folder links stop working, but Microsoft folders are not deleted.</span></label></div><Actions disabled={busy || !accepted} cancel={close} confirm="Disconnect" danger action={() => void action("disconnect", { confirmed: true })}/></Modal>}
  </div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd></div>; }
function SetupStep({ number, children }: { number: string; children: React.ReactNode }) { return <li className="flex items-start gap-2"><span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-600 text-[10px] font-bold text-white">{number}</span><span>{children}</span></li>; }
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange(value: string): void; placeholder?: string }) { return <label className="block font-bold">{label}<input className="mt-1 min-h-11 w-full rounded border px-3 font-normal" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}/></label>; }
function Actions({ disabled, cancel, confirm, action, danger = false }: { disabled: boolean; cancel: () => void; confirm: string; action: () => void; danger?: boolean }) { return <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={cancel} className="rounded border px-4 py-2 text-sm font-bold">Cancel</button><button type="button" disabled={disabled} onClick={action} className={`rounded px-4 py-2 text-sm font-bold text-white disabled:opacity-40 ${danger ? "bg-red-700" : "bg-blue-700"}`}>{confirm}</button></footer>; }
