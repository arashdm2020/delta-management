import { requireApproved } from "@/modules/auth/session";
import { MailboxList } from "@/modules/inbox/list";
export default async function Sent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  return (
    <MailboxList
      actor={await requireApproved()}
      direction="sent"
      query={await searchParams}
    />
  );
}
