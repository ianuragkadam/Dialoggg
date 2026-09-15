import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? (user.user_type === "super_admin" ? "/platform/companies" : "/projects") : "/login");
}
