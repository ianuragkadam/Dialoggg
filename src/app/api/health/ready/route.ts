import { NextResponse } from "next/server";
import db from "@/db";
import { LATEST_SCHEMA_VERSION } from "@/db/migrations";

export async function GET() {
  try {
    const row = db.prepare("SELECT MAX(version) AS version FROM schema_migration").get() as { version: number | null };
    if (row.version !== LATEST_SCHEMA_VERSION || db.pragma("quick_check", { simple: true }) !== "ok") {
      throw new Error("NOT_READY");
    }
    return NextResponse.json({ status: "ready" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
