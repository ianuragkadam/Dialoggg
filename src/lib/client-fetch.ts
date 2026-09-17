"use client";

function csrfToken() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find(value => value.startsWith("dialoggg_csrf="));
  return match ? decodeURIComponent(match.slice("dialoggg_csrf=".length)) : null;
}

export function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = String(init.method ?? "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return fetch(input, init);
  const headers = new Headers(init.headers);
  const token = csrfToken();
  if (token) headers.set("x-csrf-token", token);
  return fetch(input, { ...init, headers });
}
