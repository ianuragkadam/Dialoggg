import { redirect } from "next/navigation";
import db from "@/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import ModuleRestricted from "@/components/ModuleRestricted";
import MicrosoftStoragePrototype from "@/components/MicrosoftStoragePrototype";

export default async function MicrosoftStoragePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.user_type !== "owner" && !isAdmin(user)) return <ModuleRestricted title="Microsoft Storage is restricted" description="Only an Owner or Admin can connect company storage or manage the company folder root." />;
  const company = user.company_id ? db.prepare("SELECT name FROM company WHERE id = ?").get(user.company_id) as { name: string } | undefined : undefined;
  return <MicrosoftStoragePrototype companyName={company?.name || "Company"} />;
}
