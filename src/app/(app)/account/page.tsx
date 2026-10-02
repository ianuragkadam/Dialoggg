import db from "@/db";
import { getCurrentActor, getCurrentUser } from "@/lib/auth";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import { redirect } from "next/navigation";
import { roleLabel, statusLabel } from "@/lib/product-language";
import Link from "next/link";
import PlatformAdministratorManagement, { type PlatformAdministrator } from "@/components/PlatformAdministratorManagement";
import CompanyLogoSettings from "@/components/CompanyLogoSettings";
import EditAccountProfile from "@/components/EditAccountProfile";
import path from "node:path";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = await getCurrentActor();
  const company = user.company_id
    ? db.prepare("SELECT * FROM company WHERE id = ?").get(user.company_id) as any
    : null;
  const accountDateLabel = (value: string | null | undefined) => {
    if (!value) return "Never";
    const timestamp = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
  };
  const platformAdministrators = user.context_type === "platform"
    ? db.prepare(`
      SELECT i.id, i.first_name, i.last_name, i.normalized_email,
        CASE WHEN i.is_platform_admin = 1 THEN i.status ELSE 'invited' END AS status,
        i.is_primary_platform_admin
      FROM identity i
      WHERE i.is_platform_admin = 1 OR EXISTS (
        SELECT 1 FROM platform_admin_invitation pai
        WHERE pai.identity_id = i.id AND pai.used_at IS NULL AND pai.revoked_at IS NULL AND pai.expires_at > CURRENT_TIMESTAMP
      )
      ORDER BY is_primary_platform_admin DESC, lower(first_name), lower(last_name), id
    `).all() as PlatformAdministrator[]
    : [];
  const primary = user.context_type === "platform"
    ? db.prepare("SELECT is_primary_platform_admin FROM identity WHERE id = ?").get(user.identity_id) as { is_primary_platform_admin: number } | undefined
    : undefined;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Account Settings</h1>
      <div className="bg-white border rounded shadow-sm p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Profile information</h2>
          {actor && <EditAccountProfile initialProfile={{ firstName: actor.firstName, lastName: actor.lastName, email: actor.email }} />}
        </div>
        <div><span className="text-gray-500 text-sm">Name:</span> <strong>{user.full_name}</strong></div>
        <div><span className="text-gray-500 text-sm">Email:</span> <strong>{user.email}</strong></div>
        <div><span className="text-gray-500 text-sm">Role:</span> <strong>{roleLabel(user.user_type)}</strong></div>
        {company && (
          <>
            <hr className="my-3" />
            <div><span className="text-gray-500 text-sm">Company:</span> <strong>{company.name}</strong></div>
            <div><span className="text-gray-500 text-sm">Status:</span> <strong>{statusLabel(company.status)}</strong></div>
          </>
        )}
      </div>
      {company && <section aria-labelledby="subscription-title" className="rounded border border-blue-200 bg-white p-6 shadow-sm">
        <h2 id="subscription-title" className="font-semibold">Subscription</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div><dt className="text-sm text-gray-500">Start Date</dt><dd className="mt-1 font-semibold">{accountDateLabel(company.signup_date)}</dd></div>
          <div><dt className="text-sm text-gray-500">End Date</dt><dd className="mt-1 font-semibold">{accountDateLabel(company.expiration_date)}</dd></div>
        </dl>
        <p className="mt-3 text-sm text-gray-600">Only the Platform Owner can change the subscription end date.</p>
      </section>}
      {company && user.company_role === "owner" && actor?.actualCompanyRole === "owner" && !actor.rolePreview && <CompanyLogoSettings
        initialLogoUrl={company.logo_path ? `/api/v1/company/logo?v=${encodeURIComponent(path.basename(company.logo_path))}` : null}
      />}
      {user.context_type === "platform" && <PlatformAdministratorManagement
        initialAdministrators={platformAdministrators}
        canManage={primary?.is_primary_platform_admin === 1}
      />}
      {company ? <div className="rounded border border-blue-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold">Google Calendar</h2><p className="mt-1 text-sm text-gray-600">Manage your personal one-way Dialoggg calendar connection and synchronization health.</p></div>
          <Link href="/account/google-calendar" className="rounded bg-blue-700 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-800">Manage Google Calendar</Link>
        </div>
      </div> : <div className="rounded border border-blue-200 bg-blue-50 p-6 text-blue-950 shadow-sm">
        <h2 className="font-semibold">Google Calendar requires a company context</h2>
        <p className="mt-1 text-sm">Platform Administration does not own a personal company schedule. Switch to one of your company memberships before managing a personal Google Calendar connection.</p>
      </div>}
      <ChangePasswordForm />
    </div>
  );
}
