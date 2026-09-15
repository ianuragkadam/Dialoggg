import type { Metadata } from "next";
import ModuleRestricted from "@/components/ModuleRestricted";
import ResourceFormPrototype from "@/components/ResourceFormPrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Add Resource | Dialoggg" };
export default async function AddResourcePage() { const user = await getCurrentUser(); if (!isAdmin(user)) return <ModuleRestricted title="Resource management is restricted" description="Only an Owner or Admin can add company Resources." />; return <ResourceFormPrototype />; }
