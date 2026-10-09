"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";

const MAX_BYTES = 2 * 1024 * 1024;

export default function CompanyLogoSettings({ initialLogoUrl }: { initialLogoUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [previewUrl, setPreviewUrl] = useState(initialLogoUrl);
  const [selectedFile, setSelectedFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    setStatus("");
    const file = event.currentTarget.files?.[0];
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setSelectedFile(!!file);
    setPreviewUrl(file ? URL.createObjectURL(file) : logoUrl);
  }

  function clearSelectedFile() {
    if (inputRef.current) inputRef.current.value = "";
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setSelectedFile(false);
    setPreviewUrl(logoUrl);
    setError("");
    setStatus("");
  }

  async function removeLogo() {
    if (selectedFile) {
      clearSelectedFile();
      return;
    }
    if (!logoUrl || !window.confirm("Remove this company logo from all company pages?")) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await authenticatedFetch("/api/v1/company/logo", { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "The logo could not be removed.");
      setLogoUrl(null);
      setPreviewUrl(null);
      setStatus("Company logo removed.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The logo could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a logo image first.");
      return;
    }
    if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) {
      setError("Use a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("The image must be 2 MB or smaller.");
      return;
    }

    const form = new FormData();
    form.set("logo", file);
    setBusy(true);
    try {
      const response = await authenticatedFetch("/api/v1/company/logo", { method: "POST", body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "The logo could not be saved.");
      setLogoUrl(payload.data.logoUrl);
      setPreviewUrl(payload.data.logoUrl);
      setSelectedFile(false);
      setStatus("Company logo updated.");
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The logo could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded border border-blue-200 bg-white p-6 shadow-sm" aria-labelledby="company-logo-heading">
      <h2 id="company-logo-heading" className="font-semibold">Company Logo</h2>
      <p className="mt-1 text-sm text-gray-600">Upload a logo to show in the header on pages across your company. Use a PNG with a transparent background. It appears on a dark header.</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3" aria-label={previewUrl ? "Company logo preview" : "Company logo placeholder"}>
          {previewUrl ? <img src={previewUrl} alt="Company logo preview" className="h-full w-full object-contain" /> : <span className="text-center text-sm text-gray-500">Company Logo Here</span>}
          {previewUrl && <button type="button" onClick={removeLogo} disabled={busy} aria-label={selectedFile ? "Clear selected logo preview" : "Remove company logo"} title={selectedFile ? "Clear selected image" : "Remove company logo"} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/80 text-white shadow hover:bg-red-600 disabled:opacity-50"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6 18 18M18 6 6 18" /></svg></button>}
        </div>
        <form onSubmit={submit} className="flex flex-col items-start gap-2">
          <label htmlFor="company-logo-file" className="text-sm font-medium text-gray-800">{logoUrl ? "Replace company logo" : "Choose company logo"}</label>
          <input ref={inputRef} id="company-logo-file" name="logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={selectFile} className="max-w-full text-sm text-gray-700 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gray-800 hover:file:bg-gray-200" />
          <p className="text-xs text-gray-500">PNG, JPEG, or WebP · 2 MB maximum</p>
          <button type="submit" disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
            {busy ? "Saving…" : logoUrl ? "Update logo" : "Upload logo"}
          </button>
          {status && <p role="status" className="text-sm text-green-700">{status}</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </form>
      </div>
    </section>
  );
}
