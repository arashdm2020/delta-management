import { requireApproved } from "@/modules/auth/session";
import {
  AnnouncementsScreen,
  type Query,
} from "@/modules/notifications/components/screens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const actor = await requireApproved();
  return <AnnouncementsScreen actor={actor} query={await searchParams} />;
}
