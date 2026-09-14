import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { hashPassword, createSession } from "@/lib/auth";
import { randomBytes } from "node:crypto";

export async function POST(req: NextRequest) {
  const { company_name, full_name, email, password } = await req.json();

  if (!company_name || !email || !password) {
    return NextResponse.json({ error: "Company name, email, and password are required." }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const existing = db.prepare("SELECT id FROM user WHERE lower(email) = lower(?)").get(email);
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const hash = await hashPassword(password);
  const icalToken = "cmp_" + randomBytes(18).toString("hex");

  const result = db.transaction(() => {
    const company = db.prepare(
      "INSERT INTO company (name, tagline, ical_token) VALUES (?, '', ?)",
    ).run(company_name, icalToken);
    const companyId = company.lastInsertRowid as number;

    // The prototype creates an Admin record. Owner provisioning will be added
    // with the approved role-and-company administration module.
    const user = db.prepare(
      "INSERT INTO user (company_id, email, password_hash, full_name, user_type) VALUES (?, ?, ?, ?, 'admin')",
    ).run(companyId, email, hash, full_name || null);

    return { companyId, userId: user.lastInsertRowid as number };
  })();

  await createSession(result.userId);
  return NextResponse.json({ ok: true, companyId: result.companyId, userId: result.userId });
}
