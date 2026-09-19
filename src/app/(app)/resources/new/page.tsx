import type { Metadata } from "next";
import ModuleRestricted from "@/components/ModuleRestricted";
import ResourceFormPrototype from "@/components/ResourceFormPrototype";
import { getCurrentActor } from "@/lib/auth";
import { listAvailableResourceUsers } from "@/lib/resources";

export const metadata: Metadata = { title: "Add Resource | Dialoggg" };
export default async function AddResourcePage() { const actor = await getCurrentActor(); if (!actor || actor.contextType !== "company" || !actor.companyId || !["owner", "admin"].includes(actor.companyRole ?? "")) return <ModuleRestricted title="Resource management is restricted" description="Only an Owner or Admin can add company Resources." />; return <ResourceFormPrototype availableUsers={listAvailableResourceUsers(actor.companyId)} />; }
