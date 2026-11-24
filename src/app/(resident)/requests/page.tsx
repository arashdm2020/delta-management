import { requireApproved } from "@/modules/auth/session";
import {
  TicketsScreen,
  type Query,
} from "@/modules/notifications/components/screens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const actor = await requireApproved();
  return <TicketsScreen actor={actor} query={await searchParams} />;
}
