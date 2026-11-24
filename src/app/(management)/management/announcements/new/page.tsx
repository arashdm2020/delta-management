import { requireManager } from "@/modules/auth/session";
import { AnnouncementEditor } from "@/modules/notifications/components/screens";
export default async function Page() {
  const actor = await requireManager();
  return <AnnouncementEditor actor={actor} />;
}
