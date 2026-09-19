import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ModuleRestricted from "@/components/ModuleRestricted";
import ResourceDetailPrototype from "@/components/ResourceDetailPrototype";
import { getCurrentActor } from "@/lib/auth";
import { getResource, listAvailableResourceUsers } from "@/lib/resources";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> { const actor = await getCurrentActor(); const resourceId = Number((await params).id); const resource = actor?.companyId && Number.isInteger(resourceId) ? getResource(resourceId, actor.companyId) : null; return { title: resource ? `${resource.name} | Dialoggg` : "Resource not found | Dialoggg" }; }
export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) { const actor = await getCurrentActor(); if (!actor || actor.contextType !== "company" || !actor.companyId || actor.companyRole === "external") return <ModuleRestricted title="Resources are restricted" description="External/Clients cannot view Resource records or contact information." />; const resourceId = Number((await params).id); const resource = Number.isInteger(resourceId) ? getResource(resourceId, actor.companyId) : null; if (!resource) notFound(); const canManage = actor.companyRole === "owner" || actor.companyRole === "admin"; return <ResourceDetailPrototype sourceResource={resource} availableUsers={canManage ? listAvailableResourceUsers(actor.companyId, resource.id) : []} canManage={canManage} />; }
