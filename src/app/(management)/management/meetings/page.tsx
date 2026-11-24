import { requireManager } from "@/modules/auth/session";
import {
  MeetingsScreen,
  type Query,
} from "@/modules/notifications/components/screens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const actor = await requireManager();
  return <MeetingsScreen actor={actor} query={await searchParams} manage />;
}
