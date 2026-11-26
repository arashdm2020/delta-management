import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { member } from "@/modules/accounting/service";
import { fail, type Actor } from "@/lib/security/core";
import { z } from "zod";

export async function messagePeople(ids: string[]) {
  const people = await db.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      roles: { select: { role: { select: { name: true } } } },
      memberships: {
        where: { startsAt: { lte: new Date() }, endsAt: null },
        select: { unit: { select: { number: true } } },
      },
    },
  });
  return new Map(
    people.map((person) => [
      person.id,
      {
        name: person.name || "عضو ساختمان",
        detail: person.roles.some((r) => r.role.name === "SUPER_ADMIN")
          ? "مدیر سامانه"
          : person.roles.some((r) => r.role.name === "BOARD_MEMBER")
            ? "هیئت‌مدیره"
            : [
                ...new Set(
                  person.memberships.map((m) => "واحد " + m.unit.number),
                ),
              ].join("، ") || "عضو ساختمان",
      },
    ]),
  );
}
export async function mailbox(
  actor: Actor,
  direction: "received" | "sent",
  query: { q?: string; filter?: string; page?: string },
) {
  await member(actor);
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const filter = ["unread", "read"].includes(query.filter || "")
    ? query.filter
    : "all";
  const parsed = Number(query.page || 1);
  const page =
    Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 100000) : 1;
  const scope =
    direction === "sent"
      ? Prisma.sql`m."senderId"=${actor.id}::uuid`
      : Prisma.sql`m."recipientId"=${actor.id}::uuid`;
  const status =
    filter === "unread"
      ? Prisma.sql`AND m."readAt" IS NULL`
      : filter === "read"
        ? Prisma.sql`AND m."readAt" IS NOT NULL`
        : Prisma.empty;
  const search = q
    ? Prisma.sql`AND (COALESCE(root.subject,'') ILIKE ${"%" + q + "%"} OR m.body ILIKE ${"%" + q + "%"} OR COALESCE(root."audienceLabel",'') ILIKE ${"%" + q + "%"} OR EXISTS (SELECT 1 FROM "User" u WHERE u.id=${direction === "sent" ? Prisma.sql`m."recipientId"` : Prisma.sql`m."senderId"`} AND u.name ILIKE ${"%" + q + "%"}))`
    : Prisma.empty;
  const where = Prisma.sql`WHERE ${scope} ${status} ${search}`;
  const [rows, counts] = await db.$transaction(
    [
      db.$queryRaw<
        {
          id: string;
          threadId: string;
          senderId: string;
          recipientId: string;
          body: string;
          subject: string | null;
          audienceLabel: string | null;
          createdAt: Date;
          readAt: Date | null;
        }[]
      >`
      SELECT m.id,m."threadId",m."senderId",m."recipientId",m.body,m."createdAt",m."readAt",root.subject,root."audienceLabel"
      FROM "InboxMessage" m JOIN "InboxMessage" root ON root.id=m."threadId"
      ${where} ORDER BY m."createdAt" DESC,m.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`,
      db.$queryRaw<
        { total: bigint }[]
      >`SELECT count(*) AS total FROM "InboxMessage" m JOIN "InboxMessage" root ON root.id=m."threadId" ${where}`,
    ],
    { isolationLevel: "RepeatableRead" },
  );
  const people = await messagePeople([
    ...new Set(rows.flatMap((row) => [row.senderId, row.recipientId])),
  ]);
  return { rows, people, total: Number(counts[0].total), page, q, filter };
}
export async function privateThread(
  actor: Actor,
  id: string,
  rawPage?: string,
) {
  await member(actor);
  if (!z.uuid().safeParse(id).success) return fail("گفتگو یافت نشد.");
  const root = await db.inboxMessage.findFirst({
    where: {
      id,
      threadId: id,
      OR: [{ senderId: actor.id }, { recipientId: actor.id }],
    },
  });
  if (!root) return fail("گفتگو یافت نشد.");
  const where = {
    threadId: id,
    OR: [{ senderId: actor.id }, { recipientId: actor.id }],
  };
  const total = await db.inboxMessage.count({ where });
  const pages = Math.max(1, Math.ceil(total / 50));
  const requested = Number(rawPage || pages);
  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, pages)
      : pages;
  const rows = await db.inboxMessage.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * 50,
    take: 50,
  });
  const people = await messagePeople([root.senderId, root.recipientId]);
  return { root, rows, people, page, pages };
}
