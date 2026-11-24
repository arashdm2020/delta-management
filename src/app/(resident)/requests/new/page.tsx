import { requireApproved } from "@/modules/auth/session";
import { NewTicketScreen } from "@/modules/notifications/components/screens";
export default async function Page() {
  const actor = await requireApproved();
  return <NewTicketScreen actor={actor} />;
}
