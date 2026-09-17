"use client";

import { useState } from "react";

function csrfToken() {
  return document.cookie.split("; ").find(item => item.startsWith("dialoggg_csrf="))?.split("=").slice(1).join("=") || "";
}

export default function IntegrationInvitationAdmin({ companies }: { companies: Array<{ id: number; name: string }> }) {
  const [companyId, setCompanyId] = useState(String(companies[0]?.id ?? ""));
  const [scopeKind, setScopeKind] = useState<"company" | "platform" | "platform_and_company">("company");
  const [authorized, setAuthorized] = useState(false);
  const [links, setLinks] = useState<{ workshopUrl: string; reviewUrl: string; expiresAt: string } | null>(null);
  const [message, setMessage] = useState("");

  function randomToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  async function tokenHash(token: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  }

  async function issue() {
    setMessage("Issuing fresh links…");
    const workshopToken = randomToken();
    const reviewToken = randomToken();
    const response = await fetch("/api/v1/platform/integration-setup-invitations", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
      body: JSON.stringify({ scopeKind, companyId: scopeKind === "platform" ? null : Number(companyId), expiresInDays: 7, authorizePlatformSecrets: authorized, label: "Scott integration setup", workshopTokenHash: await tokenHash(workshopToken), reviewTokenHash: await tokenHash(reviewToken) }),
    });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error?.message || "Links could not be issued."); return; }
    setLinks({ workshopUrl: `${result.data.baseUrl}/integration-setup#token=${workshopToken}`, reviewUrl: `${result.data.baseUrl}/integration-setup-review#token=${reviewToken}`, expiresAt: result.data.expiresAt });
    setMessage("Fresh links issued. Older links with this scope are revoked.");
  }

  return <main className="mx-auto max-w-4xl space-y-6 p-6">
    <header>
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Platform administration</p>
      <h1 className="text-3xl font-bold">Secure integration setup access</h1>
      <p className="mt-2 text-slate-600">Issue one workshop link and one read-only review link. The bearer stays in the URL fragment and is shown only once.</p>
    </header>
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <label className="block font-semibold">Access scope
        <select className="mt-1 block w-full rounded border p-2" value={scopeKind} onChange={event => { setScopeKind(event.target.value as any); setAuthorized(false); }}>
          <option value="company">Company Microsoft setup only</option>
          <option value="platform_and_company">Platform Google/Resend + company Microsoft</option>
          <option value="platform">Platform Google/Resend only</option>
        </select>
      </label>
      {scopeKind !== "platform" && <label className="block font-semibold">Company
        <select className="mt-1 block w-full rounded border p-2" value={companyId} onChange={event => setCompanyId(event.target.value)}>
          {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      </label>}
      {scopeKind !== "company" && <label className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <input type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)} />
        <span><strong>I explicitly authorize access to platform credentials.</strong><br /><span className="text-sm">Platform Google OAuth and Resend credentials are never available to ordinary company Owners or Admins.</span></span>
      </label>}
      <button className="rounded bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={!companies.length && scopeKind !== "platform" || scopeKind !== "company" && !authorized} onClick={() => void issue()}>Issue and rotate links</button>
      <p role="status" aria-live="polite" className="text-sm text-slate-700">{message}</p>
    </section>
    {links && <section className="space-y-3 rounded-xl border border-green-300 bg-green-50 p-5">
      <h2 className="text-xl font-bold">Copy these links now</h2>
      <p className="text-sm">They expire {new Date(links.expiresAt).toLocaleString()}. Reloading this page will not reveal them again.</p>
      <label className="block font-semibold">Scott workshop link<input readOnly className="mt-1 block w-full rounded border bg-white p-2 font-mono text-xs" value={links.workshopUrl} onFocus={event => event.currentTarget.select()} /></label>
      <label className="block font-semibold">Internal review link<input readOnly className="mt-1 block w-full rounded border bg-white p-2 font-mono text-xs" value={links.reviewUrl} onFocus={event => event.currentTarget.select()} /></label>
    </section>}
  </main>;
}
