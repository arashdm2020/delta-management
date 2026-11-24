import { requireManager } from "@/modules/auth/session";
import {
  TicketsScreen,
  type Query,
} from "@/modules/notifications/components/screens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const actor = await requireManager();
  return <TicketsScreen actor={actor} query={await searchParams} manage />;
}
