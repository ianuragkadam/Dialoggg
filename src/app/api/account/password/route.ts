import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentUser, verifyPassword, hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { current_password, new_password } = await req.json();

  if (!current_password || !new_password) {
    return NextResponse.json({ error: "Both current and new password are required." }, { status: 400 });
  }
  if (String(new_password).length < 6) {
    return NextResponse.json({ error: "New password must be at least 6 characters." }, { status: 400 });
  }

  const row = db.prepare("SELECT password_hash FROM user WHERE id = ?").get(user.id) as { password_hash: string };
  const ok = await verifyPassword(current_password, row.password_hash);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });

  const hash = await hashPassword(new_password);
  db.prepare("UPDATE user SET password_hash = ? WHERE id = ?").run(hash, user.id);
  return NextResponse.json({ ok: true });
}
