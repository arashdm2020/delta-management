import { requireManager } from "@/modules/auth/session";
import { MeetingEditor } from "@/modules/notifications/components/screens";
export default async function Page() {
  const actor = await requireManager();
  return <MeetingEditor actor={actor} />;
}
