import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ModuleRestricted from "@/components/ModuleRestricted";
import UserDetailPrototype from "@/components/UserDetailPrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { findCompanyUserUi } from "@/lib/users-access-ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = findCompanyUserUi((await params).id);
  return { title: user ? `${user.firstName} ${user.lastName} | Dialoggg` : "User not found | Dialoggg" };
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!isAdmin(currentUser)) return <ModuleRestricted title="User management is restricted" description="Only an Owner or Admin can view company User details." />;
  const user = findCompanyUserUi((await params).id);
  if (!user) notFound();
  return <UserDetailPrototype sourceUser={user} />;
}
