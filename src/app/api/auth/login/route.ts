import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { verifyPassword, createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }
  const user = db.prepare(
    "SELECT id, email, password_hash, full_name, user_type, company_id FROM user WHERE lower(email) = lower(?)",
  ).get(email) as { id: number; password_hash: string; [k: string]: any } | undefined;
  if (!user) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  await createSession(user.id);
  return NextResponse.json({
    user: {
      id: user.id, email: user.email, full_name: user.full_name,
      user_type: user.user_type, company_id: user.company_id,
    },
  });
}
