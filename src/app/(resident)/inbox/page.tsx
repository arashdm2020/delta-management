import { redirect } from "next/navigation";
import { z } from "zod";
import { requireApproved } from "@/modules/auth/session";
import { MailboxList } from "@/modules/inbox/list";
export default async function Inbox({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    filter?: string;
    page?: string;
    thread?: string;
  }>;
}) {
  const actor = await requireApproved(),
    query = await searchParams;
  if (z.uuid().safeParse(query.thread).success)
    redirect("/inbox/thread/" + query.thread);
  return <MailboxList actor={actor} direction="received" query={query} />;
}
