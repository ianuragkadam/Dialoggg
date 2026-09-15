import type { Metadata } from "next";

import ModuleRestricted from "@/components/ModuleRestricted";
import UsersAccessPrototype from "@/components/UsersAccessPrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Users | Dialoggg" };

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return <ModuleRestricted title="User management is restricted" description="Only an Owner or Admin can view and manage the company's User directory." />;
  return <UsersAccessPrototype />;
}
