"use client";

import { useState } from "react";
import ActionFeedback, { type FeedbackKind } from "@/components/ActionFeedback";

function csrfToken() {
  return document.cookie.split("; ").find(item => item.startsWith("dialoggg_csrf="))?.split("=").slice(1).join("=") || "";
}

export default function IntegrationInvitationAdmin() {
  const [authorized, setAuthorized] = useState(false);
  const [links, setLinks] = useState<{ workshopUrl: string; reviewUrl: string; expiresAt: string } | null>(null);
  const [message, setMessage] = useState("");
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>("info");

  function randomToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  async function tokenHash(token: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  }

  async function issue() {
    setFeedbackKind("info"); setMessage("Issuing fresh links…");
    const workshopToken = randomToken();
    const reviewToken = randomToken();
    const response = await fetch("/api/v1/platform/integration-setup-invitations", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
      body: JSON.stringify({ scopeKind: "platform", companyId: null, expiresInDays: 7, authorizePlatformSecrets: authorized, label: "Scott integration setup", workshopTokenHash: await tokenHash(workshopToken), reviewTokenHash: await tokenHash(reviewToken) }),
    });
    const result = await response.json();
    if (!response.ok) { setFeedbackKind("error"); setMessage(result.error?.message || "Links could not be issued."); return; }
    setLinks({ workshopUrl: `${result.data.baseUrl}/integration-setup#token=${workshopToken}`, reviewUrl: `${result.data.baseUrl}/integration-setup-review#token=${reviewToken}`, expiresAt: result.data.expiresAt });
    setFeedbackKind("success"); setMessage("Fresh links issued. Older links with this scope are revoked.");
  }

  return <section className="space-y-6">
    <header>
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Platform administration</p>
      <h1 className="text-3xl font-bold">Secure integration setup access</h1>
      <p className="mt-2 text-slate-600">Issue one platform-provider workshop link and one read-only review link. The bearer stays in the URL fragment and is shown only once.</p>
    </header>
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><strong>Platform providers only:</strong> Google OAuth, Microsoft OAuth/Graph, and Resend. Company Owners/Admins connect their own Microsoft storage from authenticated Settings → Microsoft Storage; company credentials are never shared through this workshop.</div>
      <label className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <input type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)} />
        <span><strong>I explicitly authorize access to platform credentials.</strong><br /><span className="text-sm">Platform Google, Microsoft, and Resend credentials are never available to ordinary company Owners or Admins.</span></span>
      </label>
      <button className="rounded bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={!authorized} onClick={() => void issue()}>Issue and rotate links</button>
      <ActionFeedback message={message} kind={feedbackKind} />
    </section>
    {links && <section className="space-y-3 rounded-xl border border-green-300 bg-green-50 p-5">
      <h2 className="text-xl font-bold">Copy these links now</h2>
      <p className="text-sm">They expire {new Date(links.expiresAt).toLocaleString()}. Reloading this page will not reveal them again.</p>
      <label className="block font-semibold">Scott workshop link<input readOnly className="mt-1 block w-full rounded border bg-white p-2 font-mono text-xs" value={links.workshopUrl} onFocus={event => event.currentTarget.select()} /></label>
      <label className="block font-semibold">Internal review link<input readOnly className="mt-1 block w-full rounded border bg-white p-2 font-mono text-xs" value={links.reviewUrl} onFocus={event => event.currentTarget.select()} /></label>
    </section>}
  </section>;
}
