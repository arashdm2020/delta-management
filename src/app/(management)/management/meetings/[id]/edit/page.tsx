import { privateRecord } from "@/modules/notifications/read-boundary";
import { requireManager } from "@/modules/auth/session";
import { MeetingEditor } from "@/modules/notifications/components/screens";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireManager();
  const id = (await params).id;
  return privateRecord(() => MeetingEditor({ actor, id }));
}
