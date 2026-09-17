import { NextResponse } from "next/server";

export function apiError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  fields?: Record<string, string>,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error: { code, message, ...(fields ? { fields } : {}), ...(details ? { details } : {}), requestId } },
    { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
  );
}

export function apiSuccess<T>(data: T, requestId: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-request-id", requestId);
  headers.set("cache-control", "no-store");
  return NextResponse.json({ data, meta: { requestId } }, { ...init, headers });
}
