import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { roleLabel } from "@/lib/product-language";
import GoogleCalendarManager from "@/components/GoogleCalendarManager";

export default async function GoogleCalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.company_id) redirect("/account");
  return <GoogleCalendarManager email={user.email} role={roleLabel(user.user_type)} />;
}
