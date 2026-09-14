import db from "@/db";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

const SESSION_DAYS = 30;
const COOKIE = "dialoggg_session";

export type Role = "admin" | "viewer";

export type User = {
  id: number; email: string; full_name: string | null;
  user_type: "super_admin" | "admin" | "viewer" | "internal" | "external";
  company_id: number | null;
};

// The current prototype grants editing to Admin records. The complete Owner and
// External/Client permission matrix will be implemented in its dedicated module.
export function isAdmin(user: User | null | undefined): boolean {
  return !!user && user.user_type === "admin";
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: number) {
  const id = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.prepare("INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, expires);
  const c = await cookies();
  c.set(COOKIE, id, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expires),
  });
  return id;
}

export async function destroySession() {
  const c = await cookies();
  const sid = c.get(COOKIE)?.value;
  if (sid) db.prepare("DELETE FROM session WHERE id = ?").run(sid);
  c.delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const c = await cookies();
  const sid = c.get(COOKIE)?.value;
  if (!sid) return null;
  const sess = db.prepare(
    "SELECT * FROM session WHERE id = ? AND expires_at > datetime('now')",
  ).get(sid) as { user_id: number } | undefined;
  if (!sess) return null;
  const user = db.prepare(
    "SELECT id, email, full_name, user_type, company_id FROM user WHERE id = ?",
  ).get(sess.user_id) as User | undefined;
  return user ?? null;
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}
