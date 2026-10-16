"use client";

import { FormEvent, useState } from "react";
import styles from "@/app/landing.module.css";

export default function LandingAccessForm() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/auth/access-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "landing", ...values }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setError(result?.error?.message ?? "We couldn't send your request. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("We couldn't send your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className={styles.formCard}>
    {submitted ? <div className={styles.formSuccess} role="status"><strong>Thanks for reaching out.</strong><p>We&apos;ll be in touch within one business day.</p></div> :
      <form className={styles.form} onSubmit={submit}>
        <label>Name<input name="name" type="text" autoComplete="name" maxLength={100} required /></label>
        <label>Company<input name="company" type="text" autoComplete="organization" maxLength={100} required /></label>
        <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label>Phone<input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
        <label className={styles.formWide}>What do you build?<input name="trade" type="text" maxLength={200} placeholder="Decks, roofing, sports courts, remodeling..." /></label>
        <label className={styles.formWide}>How many crews do you run? <span className={styles.optional}>(optional)</span><select name="crews" defaultValue=""><option value="">Choose one</option><option value="1">1</option><option value="2-3">2–3</option><option value="4-6">4–6</option><option value="7 or more">7 or more</option></select></label>
        {error && <p className={styles.formError} role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "Sending..." : "Request early access"}</button>
      </form>}
  </div>;
}
