"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

function Modal({ title, alert = false, children, close }: { title: string; alert?: boolean; children: React.ReactNode; close: () => void }) {
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; document.addEventListener("keydown", key); return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); }; }, [close]);
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={close}><section role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}><header className="sticky top-0 flex items-center justify-between border-b bg-blue-900 px-5 py-4 text-white"><h2 className="text-lg font-bold">{title}</h2><button type="button" aria-label={`Close ${title}`} onClick={close} className="rounded px-2 text-2xl hover:bg-white/15">×</button></header>{children}</section></div>;
}

export default function MicrosoftStoragePrototype({ companyName }: { companyName: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [storage, setStorage] = useState<"onedrive_business" | "sharepoint">("sharepoint");
  const [sharepointHost, setSharepointHost] = useState("");
  const [sharepointPath, setSharepointPath] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [notice, setNotice] = useState("Loading Microsoft Storage…");
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [choice, setChoice] = useState("");

  async function load() {
    const response = await fetch("/api/microsoft-storage", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) { setNotice(result.error?.message || "Microsoft Storage is unavailable."); return; }
    setSnapshot(result.data); setStorage(result.data.serviceType || "sharepoint"); setNotice("");
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

  const connected = snapshot?.state === "healthy";
  const attention = !!snapshot && !connected && snapshot.state !== "connection_required" && snapshot.state !== "disconnected";
  const platformReady = snapshot?.platform.configured && snapshot.platform.status === "verified" && !snapshot.platform.disabled;
  const healthLabel = connected ? "Connected · healthy" : attention ? "Action needed" : "Not connected";
  return <div className="mx-auto max-w-6xl space-y-5 pb-10" data-microsoft-storage-ready="true">
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500"><Link href="/projects">Projects</Link><span className="px-2">/</span><span className="font-medium text-slate-800">Microsoft Storage</span></nav>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-3xl font-bold text-slate-950">Microsoft Storage</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Company connection for Project <strong>Common</strong> and <strong>Private</strong> folders in OneDrive for Business or SharePoint.</p></div><span className={`rounded-full px-3 py-1.5 text-sm font-bold ${connected ? "bg-emerald-100 text-emerald-900" : attention ? "bg-amber-100 text-amber-950" : "bg-slate-200 text-slate-800"}`}>{healthLabel}</span></div>
    {notice && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">{notice}</div>}
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><strong>Dialoggg does not store Project files</strong><p>Dialoggg stores only protected company-scoped Microsoft identifiers and shows eligible folder links. Microsoft 365 administrators grant and revoke actual folder permissions; seeing a link never bypasses Microsoft authentication.</p></section>
    {!platformReady && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Platform Microsoft application is not ready.</strong><p className="mt-1">A Platform Administrator must save and verify the permanent Microsoft OAuth / Graph application settings before this company can connect.</p></section>}
    <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{companyName}</p><h2 className="mt-1 text-xl font-bold text-slate-950">{connected ? `${snapshot?.display?.driveName} / ${snapshot?.display?.rootName}` : "No Microsoft location connected"}</h2>{connected && <p className="mt-1 text-sm text-slate-600">{snapshot?.serviceType === "sharepoint" ? "SharePoint document library" : "OneDrive for Business"} · Company root selected once · {snapshot?.display?.accountName}</p>}</div><div className="flex flex-wrap gap-2">{connected ? <><button type="button" onClick={() => { setDialog("connect"); setAccepted(false); }} className="rounded border px-3 py-2 text-sm font-bold">Reconnect</button><button type="button" onClick={() => void openRootDialog()} className="rounded border px-3 py-2 text-sm font-bold">Change root</button><button type="button" onClick={() => { setDialog("disconnect"); setAccepted(false); }} className="rounded border border-red-200 px-3 py-2 text-sm font-bold text-red-700">Disconnect</button></> : <button type="button" disabled={!platformReady} onClick={() => { setDialog("connect"); setAccepted(false); }} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Connect Microsoft Storage</button>}</div></div>
        {attention && <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Microsoft access needs attention</strong><p className="mt-1">Consent may be revoked or the saved site, library, or root identifier may no longer be reachable. Existing Microsoft folders remain untouched.</p><button type="button" disabled={busy} onClick={() => void action("retry")} className="mt-3 rounded border border-amber-700 px-3 py-2 font-bold">Retry health check</button></div>}
        <dl className="mt-5 grid gap-3 sm:grid-cols-2"><Info label="Service" value={snapshot?.serviceType === "sharepoint" ? "SharePoint document library" : snapshot?.serviceType === "onedrive_business" ? "OneDrive for Business" : "Not connected"}/><Info label="Connection scope" value="One company"/><Info label="New Project folders" value="Create below selected root"/><Info label="Existing Projects" value="May link existing folders"/></dl>
      </div>
      <aside className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Permission ownership</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600"><li><strong>Dialoggg:</strong> decides whether the Common or Private link is visible.</li><li><strong>Microsoft 365:</strong> decides whether the signed-in person can open the folder.</li><li><strong>No anonymous links:</strong> External/Clients authenticate with Microsoft.</li><li><strong>No lifecycle deletion:</strong> Project rename, Complete, Archive, Restore, or Delete never renames or deletes Microsoft folders.</li></ul></aside>
    </section>
    <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Folder model for every Project</h2><div className="mt-4 grid gap-3 md:grid-cols-2"><FolderRule title="Common" text="Visible to Owner, Admin, assigned Employees, and assigned External/Clients. Microsoft authentication and permissions still apply."/><FolderRule title="Private" text="Visible only to Owner and Admin. Its URL and stable item identifier are omitted from Employee and External/Client pages, payloads, logs, and errors."/></div><p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">Each Project has exactly one Common reference and one Private reference. Owner/Admin may create both automatically below the company root or link existing folders. Retry-safe setup reuses stored stable IDs and never duplicates folders.</p></section>
    {dialog === "connect" && <Modal title={connected ? "Reconnect Microsoft Storage" : "Connect Microsoft Storage"} close={close}><div className="space-y-4 p-5 text-sm"><p>Use the platform-managed Dialoggg Microsoft application to connect storage for <strong>{companyName}</strong>. Only an Owner or Admin can perform this company action.</p><fieldset><legend className="font-bold">Company storage type</legend><label className={`mt-2 block rounded border p-3 ${storage === "sharepoint" ? "border-blue-600 bg-blue-50" : ""}`}><input type="radio" name="storage" checked={storage === "sharepoint"} onChange={() => setStorage("sharepoint")} className="mr-2"/><strong>SharePoint document library</strong><span className="block pl-5 text-xs text-slate-600">Example: {companyName} / Projects</span></label><label className={`mt-2 block rounded border p-3 ${storage === "onedrive_business" ? "border-blue-600 bg-blue-50" : ""}`}><input type="radio" name="storage" checked={storage === "onedrive_business"} onChange={() => setStorage("onedrive_business")} className="mr-2"/><strong>OneDrive for Business</strong><span className="block pl-5 text-xs text-slate-600">Company-managed business account; personal OneDrive is not supported.</span></label></fieldset>{storage === "sharepoint" && <div className="grid gap-3 sm:grid-cols-2"><Field label="SharePoint hostname" value={sharepointHost} onChange={setSharepointHost} placeholder="contoso.sharepoint.com"/><Field label="Site path" value={sharepointPath} onChange={setSharepointPath} placeholder="sites/Operations"/></div>}<div className="grid gap-3 sm:grid-cols-2"><Info label="Consent" value="Company connection; least-required Microsoft Graph scope"/><Info label="Saved values" value="Protected tenant, drive/library, root IDs, and refresh token—never browser secrets"/></div><label className="flex items-start gap-3 rounded border p-3"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1"/><span>I understand Microsoft 365 administrators—not Dialoggg—manage actual folder permissions.</span></label></div><Actions disabled={busy || !accepted || (storage === "sharepoint" && (!sharepointHost || !sharepointPath))} cancel={close} confirm="Continue to Microsoft" action={() => void action("oauth_start", { serviceType: storage, sharepointHost, sharepointPath })}/></Modal>}
    {dialog === "root" && <Modal title="Change company folder root?" alert close={close}><div className="space-y-4 p-5 text-sm"><p>The selected root controls where <strong>future automatically created</strong> Common and Private folders are placed.</p><div className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-950"><strong>Existing Project folders do not move.</strong><p className="mt-1">Their stable Microsoft item IDs remain linked. Dialoggg never renames, moves, or deletes them automatically.</p></div><label htmlFor="root-choice" className="block font-bold">New root location</label><select id="root-choice" className="min-h-11 w-full rounded border px-3" value={choice} onChange={event => setChoice(event.target.value)}>{choices.length ? choices.map(item => <option key={item.choice} value={item.choice}>{item.name}</option>) : <option value="">Loading available folders…</option>}</select><label className="flex items-start gap-3 rounded border p-3"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1"/><span>I understand this affects only future automatic folder creation.</span></label></div><Actions disabled={busy || !accepted || !choice} cancel={close} confirm="Change root" action={() => void action("select_root", { choice, confirmed: true })}/></Modal>}
    {dialog === "disconnect" && <Modal title="Disconnect Microsoft Storage?" alert close={close}><div className="space-y-4 p-5 text-sm"><p>Common and Private links will become unavailable in Dialoggg until an Owner/Admin reconnects.</p><div className="rounded border border-red-200 bg-red-50 p-3 text-red-950"><strong>Microsoft data is preserved.</strong><p className="mt-1">Disconnecting removes no folder, file, permission, or Microsoft audit history. Stored folder references remain company-scoped for safe reconnection.</p></div><label className="flex items-start gap-3 rounded border p-3"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1"/><span>I understand Dialoggg folder links stop working, but Microsoft folders are not deleted.</span></label></div><Actions disabled={busy || !accepted} cancel={close} confirm="Disconnect" danger action={() => void action("disconnect", { confirmed: true })}/></Modal>}
  </div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd></div>; }
function FolderRule({ title, text }: { title: string; text: string }) { return <div className="rounded-lg border p-4"><h3 className="font-bold text-slate-950">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div>; }
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange(value: string): void; placeholder?: string }) { return <label className="block font-bold">{label}<input className="mt-1 min-h-11 w-full rounded border px-3 font-normal" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}/></label>; }
function Actions({ disabled, cancel, confirm, action, danger = false }: { disabled: boolean; cancel: () => void; confirm: string; action: () => void; danger?: boolean }) { return <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={cancel} className="rounded border px-4 py-2 text-sm font-bold">Cancel</button><button type="button" disabled={disabled} onClick={action} className={`rounded px-4 py-2 text-sm font-bold text-white disabled:opacity-40 ${danger ? "bg-red-700" : "bg-blue-700"}`}>{confirm}</button></footer>; }
