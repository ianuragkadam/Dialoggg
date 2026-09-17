import { NextResponse } from "next/server";

// Public company registration is intentionally unavailable in v1. Company and
// first-Owner setup belongs to authenticated Platform Administration.
export async function POST() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
