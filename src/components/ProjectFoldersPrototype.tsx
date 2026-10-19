"use client";

import { useEffect, useId, useState } from "react";

type FolderKind = "common" | "private";
type Folder = { kind: FolderKind; displayName: string; location?: string; state: string; lastVerifiedAt: string | null; lastErrorCode: string | null; canOpen: boolean };
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
  const [toast, setToast] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const howId = useId();
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
  useEffect(() => { if (!toast) return; setToastVisible(true); const fade = window.setTimeout(() => setToastVisible(false), 4000); const clear = window.setTimeout(() => setToast(""), 4500); return () => { window.clearTimeout(fade); window.clearTimeout(clear); }; }, [toast]);
  useEffect(() => { if (!folder) return; const key = (event: KeyboardEvent) => { if (event.key === "Escape") setFolder(null); }; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; document.addEventListener("keydown", key); return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); }; }, [folder]);

  async function action(name: string, extra: Record<string, unknown> = {}, targetWindow?: Window | null) {
    setBusy(true); setNotice("Checking Microsoft Storage…");
    try {
      const response = await fetch(`/api/projects/${projectId}/folders`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ action: name, ...extra }),
      });
      const result = await response.json();
      if (!response.ok) { targetWindow?.close(); await load(); setNotice(result.error?.message || "The folder action could not be completed."); return null; }
      if (result.data?.choices) { const next = result.data.choices as Choice[]; setChoices(next); setChoice(next[0]?.choice || ""); setNotice(""); return result.data; }
      if (result.data?.webUrl) {
        if (targetWindow && !targetWindow.closed) targetWindow.location.replace(result.data.webUrl);
        else window.open(result.data.webUrl, "_blank", "noopener,noreferrer");
        await load(); return result.data;
      }
      setSnapshot(result.data); setNotice(""); setToast(`${extra.kind === "private" ? "Private" : "Common"} folder saved.`); setFolder(null); await load(); return result.data;
    } catch { targetWindow?.close(); setNotice("The folder action could not be completed. Please try again."); return null; }
    finally { setBusy(false); }
  }

  function openSetup(kind: FolderKind) { setFolder(kind); setMethod("create"); setChoices([]); setChoice(""); setNotice(""); }
  function openFolder(kind: FolderKind) { const target = window.open("", "_blank"); if (target) target.opener = null; void action("open", { kind }, target); }
  async function chooseMethod(next: "create" | "link") { setMethod(next); if (next === "link" && !choices.length && snapshot?.connectionState === "healthy") await action("choices"); }
  const commonVisible = snapshot?.commonVisible ?? (canManage || assigned);
  const privateVisible = snapshot?.privateVisible ?? canManage;
  // The setup dialog must remain reachable while Microsoft is disconnected so
  // managers can see why setup is blocked and reconnect from there. The API
  // still checks manager role, active project, and Microsoft authorization.
  const editable = canManage && canEdit;
  const byKind = new Map((snapshot?.folders || []).map(item => [item.kind, item]));
  return <div className="project-folders-view min-h-[520px] space-y-5 bg-[#0e1336] p-4 text-white sm:p-6" data-project-folders-ready="true">
    {toast && <div role="status" className={`fixed right-5 top-5 z-[100] rounded-lg border border-[#4f9c69] bg-[#18342c] px-5 py-3 text-sm font-semibold text-white shadow-xl transition-opacity duration-500 ${toastVisible ? "opacity-100" : "opacity-0"}`}>✓ {toast}</div>}
    {notice && <div role="alert" className="rounded-lg border border-[#d1850b]/60 bg-[#302919] p-3 text-sm text-[#ffe7c2]">{notice}</div>}
    {privateVisible ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#c5cbe0]">This job&apos;s files live in your company OneDrive.</p><button type="button" aria-expanded={howOpen} aria-controls={howId} onClick={() => setHowOpen(value => !value)} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${howOpen ? "border-[#d1850b] text-[#f2b536]" : "border-[#343d76] text-[#e3e6f2] hover:border-[#f2b536] hover:text-[#f2b536]"}`}><span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[11px]">?</span><span>How it works</span><svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${howOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round"/></svg></button></div> : <p className="text-sm text-[#c5cbe0]">Files for this job are kept in OneDrive.</p>}
    {privateVisible && howOpen && <section id={howId} className="grid gap-4 rounded-xl border border-[#343d76] bg-[#191f50] p-5 text-sm text-[#c5cbe0] md:grid-cols-2 xl:grid-cols-4"><Rule title="Two folders per job" text="Common is for files the whole job team and the client can see. Private is for the Owner and Admins only, like contracts and pricing."/><Rule title="Files stay in OneDrive" text="Open folder takes you to OneDrive. To let someone open the files, share the folder with them there."/><Rule title="Nothing gets lost" text="Renaming or moving a folder in OneDrive won’t break the link. Completing or deleting a job never deletes its files."/><Rule title="If something goes wrong" text="If a folder is deleted or can’t be reached, you’ll see a warning here and can pick the folder again."/></section>}
    {!commonVisible && <section className="rounded-xl border border-[#343d76] bg-[#191f50] p-5 text-sm text-[#c5cbe0]">Job files are available to people assigned to this job. Ask your project manager for access.</section>}
    {commonVisible && <div className={`grid gap-4 ${privateVisible ? "lg:grid-cols-2" : "max-w-xl"}`}>
      {privateVisible ? <><FolderCard projectName={projectName} rootName={snapshot?.rootDisplayName} kind="common" folder={byKind.get("common")} connectionState={snapshot?.connectionState || "connection_required"} canEdit={editable} setup={() => openSetup("common")} open={() => openFolder("common")}/><FolderCard projectName={projectName} rootName={snapshot?.rootDisplayName} kind="private" folder={byKind.get("private")} connectionState={snapshot?.connectionState || "connection_required"} canEdit={editable} setup={() => openSetup("private")} open={() => openFolder("private")}/></> : <FilesCard projectName={projectName} folder={byKind.get("common")} connectionState={snapshot?.connectionState || "connection_required"} open={() => openFolder("common")}/>}
    </div>}
    {privateVisible && <p className="text-xs text-[#9099bd]">Folders open in OneDrive in a new tab.</p>}
    {snapshot && snapshot.project.status !== "active" && <section aria-label="Project state notice" className="rounded-lg border border-[#d1850b]/60 bg-[#302919] p-3 text-sm text-[#ffe7c2]">This job is read-only. {privateVisible ? "Existing folders can still be opened, but an Owner or Admin must restore the job before changing them." : "Existing job files can still be opened if you have access."}</section>}
    {folder && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#090d1e]/75 p-4" onMouseDown={() => setFolder(null)}>
      <section role="dialog" aria-modal="true" aria-labelledby="folder-setup-title" className="flex max-h-[92vh] w-full max-w-[700px] flex-col overflow-hidden rounded-2xl border border-[#343d76] bg-[#0e1336] text-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-[#252c60] px-6 py-6 sm:px-8">
          <div><p className="text-xs font-bold uppercase tracking-wider text-[#a9d329]">{projectName}</p><h2 id="folder-setup-title" className="mt-1 text-2xl font-bold">Set up the {folder === "common" ? "Common" : "Private"} folder</h2></div>
          <button type="button" aria-label="Close folder setup" onClick={() => setFolder(null)} className="rounded p-1 text-2xl leading-none text-[#aeb7dc] hover:text-white">×</button>
        </header>
        <div className="space-y-6 overflow-y-auto px-6 py-6 text-sm sm:px-8">
          {snapshot?.connectionState !== "healthy" && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d1850b] bg-[#2b2419] p-4 text-[#f4d6a3]"><p>Connect Microsoft Storage before Dialoggg can create or link this folder.</p><a href="/settings/microsoft-storage" className="shrink-0 rounded-md bg-[#f2b536] px-3 py-2 font-bold text-[#101a2b] hover:bg-[#e4a72c]">Connect Microsoft Storage</a></div>}
          {method === "create" && <div><p className="text-base text-[#d1d8f4]">{folder === "common" ? "The Common folder holds files everyone on this job can see." : "The Private folder holds files only Owners and Admins can see."}</p><div className="mt-3 flex flex-wrap gap-2">{(folder === "common" ? ["Owner", "Admins", "Employees on this job", "Clients on this job"] : ["Owner", "Admins"]).map(role => <span key={role} className="rounded-full bg-[#20295f] px-3 py-1 text-xs font-semibold">{role}</span>)}</div></div>}
          <fieldset><legend className="mb-3 font-bold">How do you want to set it up?</legend><div className="space-y-3">
            <label className={`flex cursor-pointer items-start gap-4 rounded-xl border-2 p-4 ${method === "create" ? "border-[#a9cf38] bg-[#191f50]" : "border-[#343d76]"}`}><input type="radio" name="folder-method" checked={method === "create"} onChange={() => void chooseMethod("create")} className="mt-1 accent-[#a9cf38]"/><span><strong className="text-base">Create a new folder</strong><span className="ml-2 rounded-full bg-[#a9cf38] px-2 py-1 text-xs font-bold text-[#101a2b]">Recommended</span><span className="mt-1 block text-[#c5cbe0]">Dialoggg makes the folder in your OneDrive for you.</span></span></label>
            <label className={`flex cursor-pointer items-start gap-4 rounded-xl border-2 p-4 ${method === "link" ? "border-[#a9cf38] bg-[#191f50]" : "border-[#343d76]"}`}><input type="radio" name="folder-method" checked={method === "link"} onChange={() => void chooseMethod("link")} disabled={snapshot?.connectionState !== "healthy"} className="mt-1 accent-[#a9cf38] disabled:cursor-not-allowed disabled:opacity-50"/><span><strong className="text-base">Use a folder I already have</strong><span className="mt-1 block text-[#c5cbe0]">Pick an existing folder inside your Dialoggg folder.</span></span></label>
          </div></fieldset>
          {method === "create" ? <div><h3 className="mb-3 font-bold">Where it will go</h3><div className="space-y-2 rounded-xl border border-[#283267] bg-[#0b1030] p-4 text-[#c0c9e8]"><p>▱ OneDrive / {snapshot?.rootDisplayName || "Configured company folder"}</p><p className="pl-6">▱ {projectName}</p><p className="pl-12 font-semibold text-white">▱ {folder === "common" ? "Common" : "Private"} <span className="ml-2 rounded-full border border-[#a9d329] px-2 py-0.5 text-xs text-[#a9d329]">New</span></p></div></div> : <div><h3 className="mb-3 font-bold">Choose a folder</h3><div className="overflow-hidden rounded-xl border border-[#283267] bg-[#0b1030]"><p className="border-b border-[#283267] p-3 text-[#c0c9e8]">{snapshot?.rootDisplayName || "Configured company folder"} / {projectName}</p><div role="radiogroup" aria-label="Existing folders" className="max-h-52 overflow-y-auto">{choices.length ? choices.map(item => <label key={item.choice} className={`flex cursor-pointer items-center justify-between border-b border-[#283267] px-4 py-3 last:border-b-0 ${choice === item.choice ? "bg-[#20295f]" : "hover:bg-[#19204e]"}`}><span>▱ &nbsp; {item.name}</span><input type="radio" name="existing-folder" value={item.choice} checked={choice === item.choice} onChange={() => setChoice(item.choice)} className="accent-[#a9d329]"/></label>) : <p className="p-4 text-[#c0c9e8]">{busy ? "Loading available folders…" : `No folders found inside ${projectName}.`}</p>}</div></div>{choice && <p className="mt-3 text-[#a9d329]">✓ This folder is inside your Dialoggg folder, so it can be used.</p>}</div>}
          <div className="flex gap-3 rounded-xl border border-[#735423] bg-[#26243d] p-4 text-[#f2dab0]"><span aria-hidden="true" className="text-lg text-[#eaa423]">ⓘ</span><p>Dialoggg shows this folder to the right people, but it doesn’t change sharing in OneDrive. Anyone who needs to open the files must also be given access there.</p></div>
        </div>
        <footer className="flex justify-end gap-3 border-t border-[#252c60] px-6 py-5 sm:px-8"><button type="button" onClick={() => setFolder(null)} className="rounded-lg border border-[#343d76] px-5 py-2.5 font-semibold text-[#e3e6f2] hover:bg-[#191f50]">Cancel</button><button type="button" disabled={busy || snapshot?.connectionState !== "healthy" || (method === "link" && !choice)} onClick={() => void action("configure", { kind: folder, method, choice, confirmed: true })} className="rounded-lg bg-[#f2b536] px-5 py-2.5 font-bold text-[#101a2b] hover:bg-[#e4a72c] disabled:cursor-not-allowed disabled:opacity-40">{method === "create" ? "Create folder" : "Use this folder"}</button></footer>
      </section>
    </div>}
  </div>;
}

function FolderCard({ projectName, rootName, kind, folder, connectionState, canEdit, setup, open }: { projectName: string; rootName: string | null | undefined; kind: FolderKind; folder?: Folder; connectionState: string; canEdit: boolean; setup(): void; open(): void }) {
  const title = kind === "common" ? "Common" : "Private";
  const state = connectionState !== "healthy" ? "connection_required" : folder?.state || "missing";
  const ready = !!folder && state === "healthy" && folder.canOpen;
  const unconfigured = !folder;
  const status = unconfigured ? "Not set up" : ready ? "Ready" : state === "missing" ? "Can't find folder" : "Needs attention";
  return <section className={`min-h-56 rounded-xl border p-5 text-white ${unconfigured ? "border-dashed border-[#515b9c] bg-[#191f50]" : ready ? "border-[#343d76] bg-[#191f50]" : "border-[#e0a21a] bg-[#211f35]"}`} aria-label={`${title} folder`}>
    <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><FolderIcon privateFolder={kind === "private"}/><div><h2 className="text-xl font-bold text-[#f4f3ff]">{title}</h2><p className="mt-1 text-sm text-[#c5cbe0]">{kind === "common" ? "Shared with everyone on this job, including clients." : "Owner and Admins only. Employees and clients can't see it."}</p></div></div><span className={`shrink-0 text-xs font-semibold ${ready ? "text-[#b9db25]" : unconfigured ? "text-[#c5cbe0]" : "text-[#f2b536]"}`}><span aria-hidden="true">●</span> {status}</span></div>
    {ready ? <div className="mt-5 rounded-lg bg-[#0e1336] p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-[#9da8c5]">OneDrive folder</p><p className="mt-1 break-words text-sm font-semibold text-[#ececf6]">{folder.location || (rootName ? `${rootName} › ${projectName} › ${folder.displayName || title}` : `${projectName} › ${folder.displayName || title}`)}</p></div> : unconfigured ? <p className="mt-5 text-sm text-[#c5cbe0]">This job doesn&apos;t have a {title} folder yet.</p> : <p className="mt-5 rounded-lg bg-[#302941] p-3 text-sm text-[#f2dfbd]">{state === "missing" ? "The folder was deleted in OneDrive, or you no longer have access to it. Pick the folder again or create a new one." : state === "permission_denied" ? "You don't have access to this folder in OneDrive. Ask your Microsoft 365 admin for access or choose another folder." : state === "connection_required" ? "Your company OneDrive connection needs to be restored before this folder can be opened." : "This folder can't be reached right now. Try again or choose another folder."}</p>}
    <div className="mt-5 flex flex-wrap items-center gap-4">{ready && <button type="button" onClick={open} className="rounded-md bg-[#f2b536] px-4 py-2 text-sm font-bold text-[#101a2b] hover:bg-[#e4a72c]">Open folder ↗</button>}{canEdit && !ready && <button type="button" onClick={setup} className="rounded-md bg-[#f2b536] px-4 py-2 text-sm font-bold text-[#101a2b] hover:bg-[#e4a72c]">{unconfigured ? "Set up folder" : "Fix folder"}</button>}{canEdit && ready && <button type="button" onClick={setup} className="text-sm font-semibold text-[#d5d8eb] underline underline-offset-2 hover:text-white">Change folder</button>}</div>
  </section>;
}

function FilesCard({ projectName, folder, connectionState, open }: { projectName: string; folder?: Folder; connectionState: string; open(): void }) {
  const ready = connectionState === "healthy" && folder?.state === "healthy" && folder.canOpen;
  return <section className="rounded-xl border border-[#343d76] bg-[#191f50] p-5 text-white" aria-label="Job files"><div className="flex items-start gap-3"><FolderIcon/><div><h2 className="text-xl font-bold">Job files</h2><p className="mt-1 text-sm text-[#c5cbe0]">Drawings, photos and documents for {projectName}.</p></div></div>{ready ? <button type="button" onClick={open} className="mt-5 rounded-md bg-[#f2b536] px-4 py-2 text-sm font-bold text-[#101a2b] hover:bg-[#e4a72c]">Open files ↗</button> : <p className="mt-5 text-sm text-[#f2d398]">Job files aren&apos;t available right now. Please contact your project manager.</p>}<p className="mt-4 text-xs text-[#9da8c5]">Opens in OneDrive. If it asks you to sign in or says you don&apos;t have access, contact your project manager.</p></section>;
}

function FolderIcon({ privateFolder = false }: { privateFolder?: boolean }) { return <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#27365a]"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={privateFolder ? "#b5b9f7" : "#b9db25"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{privateFolder ? <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></> : <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>}</svg></span>; }

function Rule({ title, text }: { title: string; text: string }) { return <div><h3 className="font-bold text-white">{title}</h3><p className="mt-1 leading-5">{text}</p></div>; }
