import { requireManager } from "@/modules/auth/session";
import {
  ResolutionIndexScreen,
  type Query,
} from "@/modules/notifications/components/screens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const actor = await requireManager();
  return <ResolutionIndexScreen actor={actor} query={await searchParams} />;
}
