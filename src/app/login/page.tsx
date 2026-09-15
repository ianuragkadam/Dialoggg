import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.user_type === "super_admin" ? "/platform/companies" : "/projects");

  return <LoginForm />;
}
