import type { Metadata } from "next";

import ModuleRestricted from "@/components/ModuleRestricted";
import UsersAccessPrototype from "@/components/UsersAccessPrototype";
import { getCurrentActor } from "@/lib/auth";
import { listCompanyUsers } from "@/lib/user-management";

export const metadata: Metadata = { title: "Users | Dialoggg" };

export default async function UsersPage() {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId || !["owner", "admin"].includes(actor.companyRole ?? "")) return <ModuleRestricted title="User management is restricted" description="Only an Owner or Admin can view and manage the company's User directory." />;
  return <UsersAccessPrototype initialUsers={listCompanyUsers(actor)} />;
}
