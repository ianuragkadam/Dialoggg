import PasswordTokenForm from "@/components/PasswordTokenForm";

export const metadata = { title: "Accept invitation | Dialoggg", referrer: "no-referrer" as const };

export default function AcceptInvitationPage() {
  return <PasswordTokenForm mode="invitation" />;
}
