import { privateRecord } from "@/modules/notifications/read-boundary";
import { requireApproved } from "@/modules/auth/session";
import { AnnouncementDetail } from "@/modules/notifications/components/screens";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireApproved();
  const id = (await params).id;
  return privateRecord(() => AnnouncementDetail({ actor, id }));
}
