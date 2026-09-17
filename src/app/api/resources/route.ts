import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/guard";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.user_type === "external") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const categories = db.prepare(
    "SELECT id, name FROM resource_category WHERE company_id = ? ORDER BY name",
  ).all(user.company_id);

  const resources = db.prepare(`
    SELECT r.id, r.name, r.email, r.phone, r.category_id, rc.name AS category
    FROM resource r
    LEFT JOIN resource_category rc ON rc.id = r.category_id
    WHERE r.company_id = ?
    ORDER BY rc.name, r.name
  `).all(user.company_id);

  return NextResponse.json({ categories, resources });
}

export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const user = g.user;
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  // Resolve or create the category
  let categoryId: number | null = null;
  if (body.category_id) {
    const category = db.prepare(
      "SELECT id FROM resource_category WHERE id = ? AND company_id = ?",
    ).get(Number(body.category_id), user.company_id) as { id: number } | undefined;
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    categoryId = category.id;
  } else if (body.category_name) {
    const existing = db.prepare(
      "SELECT id FROM resource_category WHERE company_id = ? AND lower(name) = lower(?)",
    ).get(user.company_id, body.category_name) as { id: number } | undefined;
    categoryId = existing
      ? existing.id
      : (db.prepare("INSERT INTO resource_category (company_id, name) VALUES (?, ?)")
          .run(user.company_id, body.category_name).lastInsertRowid as number);
  }

  const r = db.prepare(
    "INSERT INTO resource (company_id, category_id, name, email, phone) VALUES (?, ?, ?, ?, ?)",
  ).run(user.company_id, categoryId, body.name, body.email || null, body.phone || null);

  return NextResponse.json({ id: r.lastInsertRowid });
}
