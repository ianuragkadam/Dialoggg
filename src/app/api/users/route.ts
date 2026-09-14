import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { hashPassword } from "@/lib/auth";
import { requireAdmin } from "@/lib/guard";

export async function GET() {
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const user = g.user;
  const users = db.prepare(
    "SELECT id, email, full_name, user_type FROM user WHERE company_id = ? ORDER BY full_name, email",
  ).all(user.company_id);
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const user = g.user;
  const body = await req.json();
  const role = body.role === "admin" ? "admin" : "viewer";

  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (String(body.password).length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  const existing = db.prepare("SELECT id FROM user WHERE lower(email) = lower(?)").get(body.email);
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
  }

  const hash = await hashPassword(body.password);
  const r = db.prepare(
    "INSERT INTO user (company_id, email, password_hash, full_name, user_type) VALUES (?, ?, ?, ?, ?)",
  ).run(user.company_id, body.email, hash, body.full_name || null, role);
  return NextResponse.json({ id: r.lastInsertRowid });
}
