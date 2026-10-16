"use client";

import { useEffect, useState } from "react";

type FolderKind = "common" | "private";
type Folder = { kind: FolderKind; displayName: string; state: string; lastVerifiedAt: string | null; lastErrorCode: string | null; canOpen: boolean };
type Snapshot = {
  project: { id: number; name: string; status: string };
  connectionState: string;
  rootDisplayName: string | null;
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
      setSnapshot(result.data); setNotice(`${extra.kind === "private" ? "Private" : "Common"} folder reference saved. Microsoft 365 permissions were not changed.`); setFolder(null); return result.data;
    } finally { setBusy(false); }
  }

  function openSetup(kind: FolderKind) { setFolder(kind); setMethod("create"); setChoices([]); setChoice(""); setNotice(""); }
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
    {folder && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={() => setFolder(null)}>
      <section role="dialog" aria-modal="true" aria-labelledby="folder-setup-title" className="flex max-h-[92vh] w-full max-w-[700px] flex-col overflow-hidden rounded-2xl border border-[#2b356e] bg-[#10143d] text-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-[#252c60] px-6 py-6 sm:px-8">
          <div><p className="text-xs font-bold uppercase tracking-wider text-[#a9d329]">{projectName}</p><h2 id="folder-setup-title" className="mt-1 text-2xl font-bold">Set up the {folder === "common" ? "Common" : "Private"} folder</h2></div>
          <button type="button" aria-label="Close folder setup" onClick={() => setFolder(null)} className="rounded p-1 text-2xl leading-none text-[#aeb7dc] hover:text-white">×</button>
        </header>
        <div className="space-y-6 overflow-y-auto px-6 py-6 text-sm sm:px-8">
          {method === "create" && <div><p className="text-base text-[#d1d8f4]">{folder === "common" ? "The Common folder holds files everyone on this job can see." : "The Private folder holds files only Owners and Admins can see."}</p><div className="mt-3 flex flex-wrap gap-2">{(folder === "common" ? ["Owner", "Admins", "Employees on this job", "Clients on this job"] : ["Owner", "Admins"]).map(role => <span key={role} className="rounded-full bg-[#20295f] px-3 py-1 text-xs font-semibold">{role}</span>)}</div></div>}
          <fieldset><legend className="mb-3 font-bold">How do you want to set it up?</legend><div className="space-y-3">
            <label className={`flex cursor-pointer items-start gap-4 rounded-xl border-2 p-4 ${method === "create" ? "border-[#a9d329] bg-[#19204e]" : "border-[#30396f]"}`}><input type="radio" name="folder-method" checked={method === "create"} onChange={() => void chooseMethod("create")} className="mt-1 accent-[#a9d329]"/><span><strong className="text-base">Create a new folder</strong><span className="ml-2 rounded-full bg-[#a9d329] px-2 py-1 text-xs font-bold text-[#10143d]">Recommended</span><span className="mt-1 block text-[#b9c3e5]">Dialoggg makes the folder in your connected Microsoft storage for you.</span></span></label>
            <label className={`flex cursor-pointer items-start gap-4 rounded-xl border-2 p-4 ${method === "link" ? "border-[#a9d329] bg-[#19204e]" : "border-[#30396f]"}`}><input type="radio" name="folder-method" checked={method === "link"} onChange={() => void chooseMethod("link")} className="mt-1 accent-[#a9d329]"/><span><strong className="text-base">Use a folder I already have</strong><span className="mt-1 block text-[#b9c3e5]">Pick an existing folder from your connected Microsoft storage.</span></span></label>
          </div></fieldset>
          {method === "create" ? <div><h3 className="mb-3 font-bold">Where it will go</h3><div className="space-y-2 rounded-xl border border-[#283267] bg-[#0b1030] p-4 text-[#c0c9e8]"><p>▱ OneDrive / {snapshot?.rootDisplayName || "Configured company folder"}</p><p className="pl-6">▱ {projectName}</p><p className="pl-12 font-semibold text-white">▱ {folder === "common" ? "Common" : "Private"} <span className="ml-2 rounded-full border border-[#a9d329] px-2 py-0.5 text-xs text-[#a9d329]">New</span></p></div></div> : <div><h3 className="mb-3 font-bold">Choose a folder</h3><div className="overflow-hidden rounded-xl border border-[#283267] bg-[#0b1030]"><p className="border-b border-[#283267] p-3 text-[#c0c9e8]">{snapshot?.rootDisplayName || "Configured company folder"} / {projectName}</p><div role="radiogroup" aria-label="Existing folders" className="max-h-52 overflow-y-auto">{choices.length ? choices.map(item => <label key={item.choice} className={`flex cursor-pointer items-center justify-between border-b border-[#283267] px-4 py-3 last:border-b-0 ${choice === item.choice ? "bg-[#20295f]" : "hover:bg-[#19204e]"}`}><span>▱ &nbsp; {item.name}</span><input type="radio" name="existing-folder" value={item.choice} checked={choice === item.choice} onChange={() => setChoice(item.choice)} className="accent-[#a9d329]"/></label>) : <p className="p-4 text-[#c0c9e8]">{busy ? "Loading available folders…" : `No folders found inside ${projectName}.`}</p>}</div></div>{choice && <p className="mt-3 text-[#a9d329]">✓ This folder is inside this job’s folder and can be used.</p>}</div>}
          <div className="flex gap-3 rounded-xl border border-[#735423] bg-[#26243d] p-4 text-[#f2dab0]"><span aria-hidden="true" className="text-lg text-[#eaa423]">ⓘ</span><p>Dialoggg shows this folder to the right people, but it doesn’t change sharing in Microsoft storage. Anyone who needs to open the files must also be given access there.</p></div>
        </div>
        <footer className="flex justify-end gap-3 border-t border-[#252c60] px-6 py-5 sm:px-8"><button type="button" onClick={() => setFolder(null)} className="rounded-lg border border-[#30396f] px-5 py-2.5 font-semibold hover:bg-[#20295f]">Cancel</button><button type="button" disabled={busy || (method === "link" && !choice)} onClick={() => void action("configure", { kind: folder, method, choice, confirmed: true })} className="rounded-lg bg-[#a9d329] px-5 py-2.5 font-bold text-[#10143d] hover:bg-[#b9df3d] disabled:opacity-40">{method === "create" ? "Create folder" : "Use this folder"}</button></footer>
      </section>
    </div>}
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
