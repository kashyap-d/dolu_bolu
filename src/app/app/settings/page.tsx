import { AccountSettings } from "@/features/account/components/account-settings";
import { requirePageAuth } from "@/server/auth/session";

export default async function SettingsPage() {
  const { principal } = await requirePageAuth();
  return <AccountSettings email={principal.email} />;
}
