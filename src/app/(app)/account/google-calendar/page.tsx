import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { roleLabel } from "@/lib/product-language";
import GoogleCalendarPrototype from "@/components/GoogleCalendarPrototype";

export default async function GoogleCalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <GoogleCalendarPrototype email={user.email} role={roleLabel(user.user_type)} />;
}

