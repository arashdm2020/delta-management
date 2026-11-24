import { requireManager } from "@/modules/auth/session";
import {
  DeliveriesScreen,
  type Query,
} from "@/modules/notifications/components/screens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const actor = await requireManager();
  return <DeliveriesScreen actor={actor} query={await searchParams} />;
}
