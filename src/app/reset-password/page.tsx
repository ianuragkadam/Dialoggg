import PasswordTokenForm from "@/components/PasswordTokenForm";

export const metadata = { title: "Reset password | Dialoggg", referrer: "no-referrer" as const };

export default function ResetPasswordPage() {
  return <PasswordTokenForm mode="reset" />;
}
