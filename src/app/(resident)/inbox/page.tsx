import { InboxForm, InboxRecipients } from "@/modules/inbox/form";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApproved } from "@/modules/auth/session";
import { canManage } from "@/lib/security/core";
import { readInbox } from "@/modules/inbox/actions";
import { jalaliTime } from "@/lib/dates";

export default async function Inbox({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const actor = await requireApproved();
  const { thread } = await searchParams;
  const selected = z.uuid().safeParse(thread);
  const participants = [{ senderId: actor.id }, { recipientId: actor.id }];
  const [roots, messages, users] = await Promise.all([
    db.$queryRaw<
      { id: string; body: string; senderId: string; recipientId: string }[]
    >`
      SELECT root.id,root.body,root."senderId",root."recipientId"
      FROM "InboxMessage" root JOIN "InboxMessage" msg ON msg."threadId"=root.id
      WHERE (root."senderId"=${actor.id}::uuid OR root."recipientId"=${actor.id}::uuid)
      GROUP BY root.id ORDER BY max(msg."createdAt") DESC LIMIT 50
    `,
    selected.success
      ? db.inboxMessage.findMany({
          where: { threadId: selected.data, OR: participants },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : [],
    canManage(actor)
      ? db.user.findMany({
          where: { status: "APPROVED", id: { not: actor.id } },
          select: { id: true, name: true },
          take: 100,
        })
      : [],
  ]);
  const units = canManage(actor)
    ? await db.unit.findMany({
        where: {
          active: true,
          building: { key: "delta" },
          memberships: {
            some: {
              userId: { not: actor.id },
              startsAt: { lte: new Date() },
              endsAt: null,
              user: { status: "APPROVED" },
            },
          },
        },
        select: { number: true, floor: true },
        orderBy: { number: "asc" },
      })
    : [];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex justify-between">
        <h1 className="page-heading">صندوق پیام‌ها</h1>
        <Link className="nav-extra bg-primary text-white" href="#compose">
          پیام جدید
        </Link>
      </div>
      <section
        aria-label="گفتگوها"
        className="rounded-2xl border border-border bg-white p-5"
      >
        <h2 className="mb-3 font-bold">گفتگوهای من</h2>
        {!roots.length && (
          <p className="text-secondary">
            هنوز گفتگویی ندارید. از فرم زیر برای ارسال پیام استفاده کنید.
          </p>
        )}
        <ul className="divide-y divide-border">
          {roots.map((row) => (
            <li key={row.id} className="py-3">
              <Link href={`/inbox?thread=${row.id}`}>
                {row.senderId === actor.id ? "ارسالی" : "دریافتی"} ·{" "}
                {row.body.slice(0, 75)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {messages.length > 0 && (
        <section className="space-y-2">
          <form action={readInbox}>
            <input type="hidden" name="thread" value={selected.data} />
            <button>علامت‌گذاری به عنوان خوانده‌شده</button>
          </form>
          {messages.toReversed().map((row) => (
            <article key={row.id} className="rounded border p-3">
              <p className="whitespace-pre-wrap break-words">{row.body}</p>
              <small>
                {row.senderId === actor.id ? "ارسالی" : "دریافتی"} ·{" "}
                {jalaliTime(row.createdAt)} ·{" "}
                {row.readAt ? "خوانده‌شده" : "خوانده‌نشده"}
              </small>
            </article>
          ))}
          <InboxForm className="grid gap-4 rounded-2xl border border-border bg-white p-5">
            <input type="hidden" name="requestId" value={randomUUID()} />
            <input type="hidden" name="thread" value={selected.data} />
            <label>
              پاسخ
              <textarea
                className="mt-2 min-h-32 w-full rounded-xl border border-input bg-white p-3 focus:outline-2 focus:outline-primary"
                name="body"
                required
                maxLength={4000}
              />
            </label>
          </InboxForm>
        </section>
      )}
      <InboxForm
        id="compose"
        className="scroll-mt-6 grid gap-4 rounded-2xl border border-border bg-white p-5"
      >
        {!canManage(actor) && (
          <p className="text-sm text-secondary">
            پیام شما به هیئت‌مدیره و مدیر سامانه می‌رسد؛ پاسخ را در همین صندوق
            می‌بینید.
          </p>
        )}
        <input type="hidden" name="requestId" value={randomUUID()} />
        <h2 className="text-lg font-bold">
          {canManage(actor)
            ? "ارسال پیام به ساکنان یا هیئت‌مدیره"
            : "ارسال پیام به هیئت‌مدیره"}
        </h2>
        {!canManage(actor) && <input type="hidden" name="kind" value="BOARD" />}
        {canManage(actor) && (
          <>
            <InboxRecipients
              users={users.map((u) => ({
                value: u.id,
                label: u.name || "نام ثبت نشده",
              }))}
              units={units.map((u) => ({
                value: u.number,
                label: "واحد " + u.number,
              }))}
              floors={[...new Set(units.map((u) => u.floor))].map((f) => ({
                value: f,
                label: "طبقه " + f,
              }))}
            />
            <label>
              <input type="checkbox" name="push" /> ارسال Web Push به دستگاه‌های
              مشترک
            </label>
            <label>
              <input type="checkbox" name="sms" /> پیامک اعلان با پترن تأییدشده
            </label>
          </>
        )}
        <label>
          متن پیام
          <textarea
            className="mt-2 min-h-32 w-full rounded-xl border border-input bg-white p-3 focus:outline-2 focus:outline-primary"
            name="body"
            required
            maxLength={4000}
          />
        </label>
      </InboxForm>
    </div>
  );
}
