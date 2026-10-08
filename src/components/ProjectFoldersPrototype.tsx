"use client";

import { useEffect, useState } from "react";

type FolderKind = "common" | "private";
type Folder = { kind: FolderKind; displayName: string; state: string; lastVerifiedAt: string | null; lastErrorCode: string | null; canOpen: boolean };
type Snapshot = {
  project: { id: number; name: string; status: string };
  connectionState: string;
  commonVisible: boolean;
  privateVisible: boolean;
  canEdit: boolean;
  folders: Folder[];
};
type Choice = { choice: string; name: string };

function csrfToken() {
  return document.cookie.split("; ").find(item => item.startsWith("dialoggg_csrf="))?.split("=").slice(1).join("=") || "";
}

export default function ProjectFoldersPrototype({ projectId, projectName, canManage, canEdit, assigned }: { projectId: number; projectName: string; canManage: boolean; canEdit: boolean; assigned: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [folder, setFolder] = useState<FolderKind | null>(null);
  const [method, setMethod] = useState<"create" | "link">("create");
  const [accepted, setAccepted] = useState(false);
  const [notice, setNotice] = useState("Loading Microsoft folder references…");
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [choice, setChoice] = useState("");

  async function load() {
    const response = await fetch(`/api/projects/${projectId}/folders`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) { setNotice(result.error?.message || "Project folders are unavailable."); return; }
    setSnapshot(result.data); setNotice("");
  }

  useEffect(() => { void load(); }, [projectId]);
  useEffect(() => { if (!folder) return; const key = (event: KeyboardEvent) => { if (event.key === "Escape") setFolder(null); }; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; document.addEventListener("keydown", key); return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); }; }, [folder]);

  async function action(name: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setNotice("Checking Microsoft Storage…");
    try {
      const response = await fetch(`/api/projects/${projectId}/folders`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ action: name, ...extra }),
      });
      const result = await response.json();
      if (!response.ok) { setNotice(result.error?.message || "The folder action could not be completed."); await load(); return null; }
      if (result.data?.choices) { const next = result.data.choices as Choice[]; setChoices(next); setChoice(next[0]?.choice || ""); setNotice(""); return result.data; }
      if (result.data?.webUrl) {
        window.open(result.data.webUrl, "_blank", "noopener,noreferrer");
        setNotice(`${extra.kind === "private" ? "Private" : "Common"} opened in a new Microsoft-authenticated browser tab.`);
        await load(); return result.data;
      }
      setSnapshot(result.data); setNotice(`${extra.kind === "private" ? "Private" : "Common"} folder reference saved. Microsoft 365 permissions were not changed.`); setFolder(null); setAccepted(false); return result.data;
    } finally { setBusy(false); }
  }

  function openSetup(kind: FolderKind) { setFolder(kind); setAccepted(false); setMethod("create"); setChoices([]); setChoice(""); setNotice(""); }
  async function chooseMethod(next: "create" | "link") { setMethod(next); if (next === "link" && !choices.length) await action("choices"); }
  const commonVisible = snapshot?.commonVisible ?? (canManage || assigned);
  const privateVisible = snapshot?.privateVisible ?? canManage;
  const editable = !!snapshot?.canEdit && canEdit;
  const byKind = new Map((snapshot?.folders || []).map(item => [item.kind, item]));
  return <div className="space-y-4" data-project-folders-ready="true">
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><strong>Microsoft files stay in Microsoft 365</strong><p>These are protected links—not an in-app file browser. Microsoft authentication and permissions always apply after a link opens in a new browser tab.</p></section>
    {notice && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">{notice}</div>}
    {!commonVisible && <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">Project folders are not available</h2><p className="mt-2 text-sm text-slate-600">This Employee is not assigned to {projectName}. Company schedules remain readable, but the Common link is limited to assigned Employees. Private is always Owner/Admin only.</p></section>}
    {commonVisible && <div className="grid gap-4 lg:grid-cols-2"><FolderCard projectName={projectName} kind="common" folder={byKind.get("common")} connectionState={snapshot?.connectionState || "connection_required"} canEdit={editable} setup={() => openSetup("common")} open={() => void action("open", { kind: "common" })}/>{privateVisible && <FolderCard projectName={projectName} kind="private" folder={byKind.get("private")} connectionState={snapshot?.connectionState || "connection_required"} canEdit={editable} setup={() => openSetup("private")} open={() => void action("open", { kind: "private" })}/>}</div>}
    {commonVisible && !privateVisible && <p className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-600"><strong>Private is protected.</strong> Its link, URL, and stable Microsoft item identifier are not included in this Employee or External/Client view.</p>}
    <section className="rounded-xl border bg-white p-5"><h2 className="font-bold text-slate-950">How folder references behave</h2><div className="mt-3 grid gap-3 text-sm md:grid-cols-3"><Rule title="Stable Microsoft IDs" text="A rename or move inside the same Microsoft drive keeps the reference valid; the display name refreshes without changing the Project."/><Rule title="No automatic lifecycle action" text="Project rename, Complete, Archive, Restore, or permanent Delete never renames, moves, or deletes Microsoft folders."/><Rule title="Graceful recovery" text="Missing or moved, Permission denied, Company disconnected, and revoked states never crash the Project or expose the Private reference."/></div></section>
    {snapshot?.project.status !== "active" && <section aria-label="Project state notice" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Archived Projects are read-only. Existing Common and Private links remain available to eligible roles, but folder references cannot be changed until an Owner or Admin restores the Project to Active.</section>}
    {folder && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={() => setFolder(null)}><section role="dialog" aria-modal="true" aria-label={`Set up ${folder === "common" ? "Common" : "Private"} folder`} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}><header className="flex items-center justify-between bg-blue-900 px-5 py-4 text-white"><h2 className="text-lg font-bold">Set up {folder === "common" ? "Common" : "Private"} folder</h2><button type="button" aria-label="Close folder setup" onClick={() => setFolder(null)} className="text-2xl">×</button></header><div className="space-y-4 p-5 text-sm"><p>{folder === "common" ? "Common may be shown to Owner, Admin, assigned Employees, and assigned External/Clients." : "Private is visible only to Owner and Admin and is never exposed to other roles."}</p><fieldset><legend className="font-bold">Setup method</legend><label className={`mt-2 block rounded border p-3 ${method === "create" ? "border-blue-600 bg-blue-50" : ""}`}><input type="radio" name="folder-method" checked={method === "create"} onChange={() => void chooseMethod("create")} className="mr-2"/><strong>Create automatically</strong><span className="block pl-5 text-xs text-slate-600">Create one retry-safe folder below the configured company root using a stable item ID.</span></label><label className={`mt-2 block rounded border p-3 ${method === "link" ? "border-blue-600 bg-blue-50" : ""}`}><input type="radio" name="folder-method" checked={method === "link"} onChange={() => void chooseMethod("link")} className="mr-2"/><strong>Link existing folder</strong><span className="block pl-5 text-xs text-slate-600">Select an existing folder in the connected site/library; Dialoggg validates its object type and company location.</span></label></fieldset>{method === "link" && <label className="block font-bold">Existing Microsoft folder<select className="mt-1 min-h-11 w-full rounded border px-3 font-normal" value={choice} onChange={event => setChoice(event.target.value)}>{choices.length ? choices.map(item => <option key={item.choice} value={item.choice}>{item.name}</option>) : <option value="">Loading available folders…</option>}</select></label>}<div className="rounded border bg-slate-50 p-3"><strong>Review</strong><p className="mt-1 text-xs leading-5 text-slate-600">{projectName} / {folder === "common" ? "Common" : "Private"} · {method === "create" ? "Create below the configured company root" : "Link an existing Microsoft folder"} · Microsoft 365 permissions remain unchanged.</p></div><label className="flex items-start gap-3 rounded border p-3"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1"/><span>I understand Dialoggg shows an eligible link but does not grant Microsoft folder access.</span></label></div><footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setFolder(null)} className="rounded border px-4 py-2 text-sm font-bold">Cancel</button><button type="button" disabled={busy || !accepted || (method === "link" && !choice)} onClick={() => void action("configure", { kind: folder, method, choice, confirmed: true })} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Confirm folder</button></footer></section></div>}
  </div>;
}

function FolderCard({ projectName, kind, folder, connectionState, canEdit, setup, open }: { projectName: string; kind: FolderKind; folder?: Folder; connectionState: string; canEdit: boolean; setup(): void; open(): void }) {
  const title = kind === "common" ? "Common" : "Private";
  const state = connectionState !== "healthy" ? "connection_required" : folder?.state || "missing";
  const status = !folder ? "Not configured" : state === "healthy" ? "Available" : state === "missing" ? "Missing or moved" : state === "permission_denied" ? "Microsoft permission denied" : state === "connection_required" ? "Company connection unavailable" : "Action needed";
  const ready = !!folder && state === "healthy";
  return <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{kind === "common" ? "Project team and assigned External/Clients" : "Owner and Admin only"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ready ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}>{status}</span></div>{ready ? <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm"><strong>{folder.displayName || `${projectName} — ${title}`}</strong><p className="mt-1 text-xs text-slate-500">Protected stable Microsoft item ID · display name refreshes after Microsoft rename</p></div> : <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{state === "permission_denied" ? "The link is eligible in Dialoggg, but Microsoft denied this signed-in account. Ask a Microsoft 365 administrator for access." : state === "connection_required" ? "Reconnect the company Microsoft Storage connection before opening or relinking folders." : !folder ? `No ${title} folder reference has been saved.` : "The saved folder cannot be reached. An Owner/Admin can locate and relink the intended folder."}</p>}<div className="mt-4 flex flex-wrap gap-2">{ready && <button type="button" onClick={open} className="rounded bg-blue-700 px-3 py-2 text-sm font-bold text-white">Open {title}</button>}{canEdit && <button type="button" onClick={setup} className="rounded border px-3 py-2 text-sm font-bold">{ready ? `Change ${title} link` : `Set up ${title}`}</button>}</div></section>;
}

function Rule({ title, text }: { title: string; text: string }) { return <div className="rounded-lg border bg-slate-50 p-3"><h3 className="font-bold text-slate-900">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{text}</p></div>; }
