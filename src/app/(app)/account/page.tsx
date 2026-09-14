import db from "@/db";
import { getCurrentUser } from "@/lib/auth";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import { redirect } from "next/navigation";
import { roleLabel, statusLabel } from "@/lib/product-language";

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
      <ChangePasswordForm />
    </div>
  );
}
