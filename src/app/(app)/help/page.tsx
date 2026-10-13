import { getCurrentUser } from "@/lib/auth";
import HelpCenter from "@/components/HelpCenter";

export default async function HelpPage() {
  const user = await getCurrentUser();
  return <HelpCenter role={user?.company_role ?? (user?.context_type === "platform" ? "platform_administrator" : "external")} />;
}
