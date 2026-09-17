import db from "@/db";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { sha256 } from "@/lib/security";

const SESSION_HOURS = 12;
export const SESSION_COOKIE = "dialoggg_session";
export const CSRF_COOKIE = "dialoggg_csrf";

export type CompanyRole = "owner" | "admin" | "employee" | "external";
export type ContextType = "company" | "platform";

export type AuthContext = {
  type: ContextType;
  companyId: number | null;
  companyName: string | null;
  membershipId: number | null;
  role: CompanyRole | "platform_administrator";
};

export type Actor = {
  sessionId: number;
  identityId: number;
  legacyUserId: number | null;
  membershipId: number | null;
  email: string;
  firstName: string;
  lastName: string;
  contextType: ContextType;
  companyId: number | null;
  companyName: string | null;
  companyTimeZone: string | null;
  companyRole: CompanyRole | null;
  isPlatformAdmin: boolean;
  csrfHash: string;
  expiresAt: string;
};

export type User = {
  id: number;
  identity_id: number;
  membership_id: number | null;
  email: string;
  full_name: string | null;
  user_type: "super_admin" | "owner" | "admin" | "viewer" | "internal" | "external";
  company_id: number | null;
  company_role: CompanyRole | null;
  context_type: ContextType;
};

export function isAdmin(user: User | null | undefined): boolean {
  return !!user && (user.user_type === "owner" || user.user_type === "admin");
}

export function isPlatformAdmin(user: User | null | undefined): boolean {
  return !!user && user.user_type === "super_admin";
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

function legacyRole(role: CompanyRole | null, platform: boolean): User["user_type"] {
  if (platform) return "super_admin";
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  if (role === "external") return "external";
  return "internal";
}

function actorToUser(actor: Actor): User {
  const fullName = `${actor.firstName} ${actor.lastName}`.trim();
  return {
    id: actor.legacyUserId ?? actor.membershipId ?? actor.identityId,
    identity_id: actor.identityId,
    membership_id: actor.membershipId,
    email: actor.email,
    full_name: fullName || null,
    user_type: legacyRole(actor.companyRole, actor.contextType === "platform"),
    company_id: actor.companyId,
    company_role: actor.companyRole,
    context_type: actor.contextType,
  };
}

export function listAuthContexts(identityId: number): AuthContext[] {
  const identity = db.prepare("SELECT is_platform_admin FROM identity WHERE id = ? AND status = 'active'").get(identityId) as {
    is_platform_admin: number;
  } | undefined;
  if (!identity) return [];

  const contexts: AuthContext[] = [];
  if (identity.is_platform_admin === 1) {
    contexts.push({
      type: "platform",
      companyId: null,
      companyName: null,
      membershipId: null,
      role: "platform_administrator",
    });
  }

  const memberships = db.prepare(`
    SELECT cm.id AS membership_id, cm.company_id, cm.role, c.name AS company_name
    FROM company_membership cm
    JOIN company c ON c.id = cm.company_id
    WHERE cm.identity_id = ? AND cm.status = 'active' AND lower(c.status) = 'active'
    ORDER BY lower(c.name), cm.id
  `).all(identityId) as Array<{
    membership_id: number;
    company_id: number;
    company_name: string;
    role: CompanyRole;
  }>;
  for (const membership of memberships) {
    contexts.push({
      type: "company",
      companyId: membership.company_id,
      companyName: membership.company_name,
      membershipId: membership.membership_id,
      role: membership.role,
    });
  }
  return contexts;
}

function resolveContext(identityId: number, requested?: { type: ContextType; membershipId?: number | null }) {
  const contexts = listAuthContexts(identityId);
  if (requested?.type === "platform") {
    const platform = contexts.find(context => context.type === "platform");
    if (!platform) throw new Error("CONTEXT_FORBIDDEN");
    return platform;
  }
  if (requested?.type === "company") {
    const company = contexts.find(context => context.type === "company" && context.membershipId === requested.membershipId);
    if (!company) throw new Error("CONTEXT_FORBIDDEN");
    return company;
  }
  const platform = contexts.find(context => context.type === "platform");
  return platform ?? contexts[0] ?? null;
}

async function setSessionCookies(token: string, csrfToken: string, expiresAt: string) {
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  const expires = new Date(expiresAt);
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires,
  });
  cookieStore.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    sameSite: "strict",
    path: "/",
    secure,
    expires,
  });
}

export async function createSession(
  identityId: number,
  requested?: { type: ContextType; membershipId?: number | null },
) {
  const context = resolveContext(identityId, requested);
  if (!context) throw new Error("NO_AUTHORIZED_CONTEXT");
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString();
  const result = db.prepare(`
    INSERT INTO auth_session (
      token_hash, identity_id, active_company_id, active_membership_id,
      context_type, csrf_hash, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sha256(token),
    identityId,
    context.companyId,
    context.membershipId,
    context.type,
    sha256(csrfToken),
    expiresAt,
  );
  await setSessionCookies(token, csrfToken, expiresAt);
  return { sessionId: Number(result.lastInsertRowid), csrfToken, expiresAt, context };
}

export function actorForSessionToken(token: string): Actor | null {
  const row = db.prepare(`
    SELECT
      s.id AS session_id, s.identity_id, s.active_company_id, s.active_membership_id,
      s.context_type, s.csrf_hash, s.expires_at, s.last_seen_at,
      i.legacy_user_id, i.normalized_email, i.first_name, i.last_name,
      i.status AS identity_status, i.is_platform_admin,
      cm.role AS company_role, cm.status AS membership_status,
      c.name AS company_name, c.time_zone AS company_time_zone, c.status AS company_status
    FROM auth_session s
    JOIN identity i ON i.id = s.identity_id
    LEFT JOIN company_membership cm ON cm.id = s.active_membership_id
    LEFT JOIN company c ON c.id = s.active_company_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL
  `).get(sha256(token)) as {
    session_id: number;
    identity_id: number;
    active_company_id: number | null;
    active_membership_id: number | null;
    context_type: ContextType;
    csrf_hash: string;
    expires_at: string;
    last_seen_at: string;
    legacy_user_id: number | null;
    normalized_email: string;
    first_name: string;
    last_name: string;
    identity_status: string;
    is_platform_admin: number;
    company_role: CompanyRole | null;
    membership_status: string | null;
    company_name: string | null;
    company_time_zone: string | null;
    company_status: string | null;
  } | undefined;
  if (!row || row.identity_status !== "active" || Date.parse(row.expires_at) <= Date.now()) return null;

  if (row.context_type === "platform") {
    if (row.is_platform_admin !== 1 || row.active_company_id !== null || row.active_membership_id !== null) return null;
  } else {
    if (
      !row.active_company_id || !row.active_membership_id ||
      row.membership_status !== "active" || row.company_status?.toLowerCase() !== "active"
    ) return null;
    const membershipOwner = db.prepare(`
      SELECT 1 FROM company_membership
      WHERE id = ? AND identity_id = ? AND company_id = ? AND status = 'active'
    `).get(row.active_membership_id, row.identity_id, row.active_company_id);
    if (!membershipOwner) return null;
  }

  if (Date.now() - Date.parse(row.last_seen_at) > 15 * 60_000) {
    db.prepare("UPDATE auth_session SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.session_id);
    db.prepare("UPDATE identity SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.identity_id);
  }

  return {
    sessionId: row.session_id,
    identityId: row.identity_id,
    legacyUserId: row.legacy_user_id,
    membershipId: row.active_membership_id,
    email: row.normalized_email,
    firstName: row.first_name,
    lastName: row.last_name,
    contextType: row.context_type,
    companyId: row.active_company_id,
    companyName: row.company_name,
    companyTimeZone: row.company_time_zone,
    companyRole: row.company_role,
    isPlatformAdmin: row.is_platform_admin === 1,
    csrfHash: row.csrf_hash,
    expiresAt: row.expires_at,
  };
}

export async function getCurrentActor(): Promise<Actor | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return token ? actorForSessionToken(token) : null;
}

export async function getCurrentUser(): Promise<User | null> {
  const actor = await getCurrentActor();
  return actor ? actorToUser(actor) : null;
}

export async function rotateActiveContext(requested: { type: ContextType; membershipId?: number | null }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) throw new Error("UNAUTHENTICATED");
  const actor = actorForSessionToken(token);
  if (!actor) throw new Error("UNAUTHENTICATED");
  resolveContext(actor.identityId, requested);
  db.prepare("UPDATE auth_session SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'context_changed' WHERE id = ?")
    .run(actor.sessionId);
  return createSession(actor.identityId, requested);
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    db.prepare(`
      UPDATE auth_session SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
        revoke_reason = COALESCE(revoke_reason, 'logout')
      WHERE token_hash = ?
    `).run(sha256(token));
  }
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(CSRF_COOKIE);
}

export function revokeIdentitySessions(identityId: number, reason: string, exceptSessionId?: number) {
  if (exceptSessionId) {
    db.prepare(`
      UPDATE auth_session SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = ?
      WHERE identity_id = ? AND id <> ? AND revoked_at IS NULL
    `).run(reason, identityId, exceptSessionId);
  } else {
    db.prepare(`
      UPDATE auth_session SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = ?
      WHERE identity_id = ? AND revoked_at IS NULL
    `).run(reason, identityId);
  }
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}
