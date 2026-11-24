import { requireApproved } from "@/modules/auth/session";
import { PreferencesScreen } from "@/modules/notifications/components/screens";
export default async function Page() {
  const actor = await requireApproved();
  return <PreferencesScreen actor={actor} />;
}
