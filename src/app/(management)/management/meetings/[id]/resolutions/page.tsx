import { privateRecord } from "@/modules/notifications/read-boundary";
import { requireManager } from "@/modules/auth/session";
import { ResolutionsScreen } from "@/modules/notifications/components/screens";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireManager();
  const id = (await params).id;
  return privateRecord(() => ResolutionsScreen({ actor, id }));
}
