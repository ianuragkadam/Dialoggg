import db from "@/db";
import { getCurrentUser } from "@/lib/auth";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import { redirect } from "next/navigation";
import { roleLabel, statusLabel } from "@/lib/product-language";
import Link from "next/link";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const company = user.company_id
    ? db.prepare("SELECT * FROM company WHERE id = ?").get(user.company_id) as any
    : null;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Account Settings</h1>
      <div className="bg-white border rounded shadow-sm p-6 space-y-3">
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
      <div className="rounded border border-blue-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold">Google Calendar</h2><p className="mt-1 text-sm text-gray-600">Manage your personal one-way Dialoggg calendar connection and synchronization health.</p></div>
          <Link href="/account/google-calendar" className="rounded bg-blue-700 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-800">Manage Google Calendar</Link>
        </div>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
