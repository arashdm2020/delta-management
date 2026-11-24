import { requireApproved } from "@/modules/auth/session";
import {
  NotificationsScreen,
  type Query,
} from "@/modules/notifications/components/screens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const actor = await requireApproved();
  return <NotificationsScreen actor={actor} query={await searchParams} />;
}
