import { requireManager } from "@/modules/auth/session";
import { OverviewScreen } from "@/modules/notifications/components/screens";
export default async function Page() {
  const actor = await requireManager();
  return <OverviewScreen actor={actor} />;
}
