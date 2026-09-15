import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ModuleRestricted from "@/components/ModuleRestricted";
import ResourceDetailPrototype from "@/components/ResourceDetailPrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { findResourceUi } from "@/lib/resources-ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> { const resource = findResourceUi((await params).id); return { title: resource ? `${resource.name} | Dialoggg` : "Resource not found | Dialoggg" }; }
export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) { const user = await getCurrentUser(); if (user?.user_type === "external") return <ModuleRestricted title="Resources are restricted" description="External/Clients cannot view Resource records or contact information." />; const resource = findResourceUi((await params).id); if (!resource) notFound(); return <ResourceDetailPrototype sourceResource={resource} canManage={isAdmin(user)} />; }
