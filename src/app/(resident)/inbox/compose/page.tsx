import { randomUUID } from "node:crypto";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireApproved } from "@/modules/auth/session";
import { canManage } from "@/lib/security/core";
import { InboxForm, InboxRecipients } from "@/modules/inbox/form";
import { Input } from "@/components/ui/input";
import { naturalOrder } from "@/modules/building-layout/layout";
export default async function Compose() {
  const actor = await requireApproved(),
    manager = canManage(actor);
  const [users, units] = manager
    ? await Promise.all([
        db.user.findMany({
          where: { status: "APPROVED", id: { not: actor.id } },
          select: { id: true, name: true },
          take: 100,
          orderBy: { name: "asc" },
        }),
        db.unit.findMany({
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
        }),
      ])
    : [[], []];
  units.sort((a, b) => naturalOrder(a.number, b.number));
  return (
    <section className="max-w-3xl rounded-2xl border border-border bg-white p-5 sm:p-6">
      <h2 className="mb-5 text-xl font-bold">پیام جدید</h2>
      <InboxForm className="grid gap-5">
        <input type="hidden" name="requestId" value={randomUUID()} />
        {manager ? (
          <InboxRecipients
            users={users.map((u) => ({
              value: u.id,
              label: u.name || "عضو ساختمان",
            }))}
            units={units.map((u) => ({
              value: u.number,
              label: "واحد " + u.number,
            }))}
            floors={[...new Set(units.map((u) => u.floor))]
              .sort(naturalOrder)
              .map((f) => ({ value: f, label: "طبقه " + f }))}
          />
        ) : (
          <>
            <input type="hidden" name="kind" value="BOARD" />
            <p className="text-sm text-secondary">
              گیرندگان: هیئت‌مدیره و مدیر سامانه
            </p>
          </>
        )}
        <label className="field">
          موضوع
          <Input name="subject" required maxLength={200} />
        </label>
        <label className="field">
          متن پیام
          <textarea
            name="body"
            required
            maxLength={4000}
            rows={7}
            className="w-full resize-y rounded-xl border border-input bg-white p-3 focus:outline-2 focus:outline-primary"
          />
        </label>
        {manager && (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium">
              کانال‌های اطلاع‌رسانی اختیاری
            </legend>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="push" />
              اعلان Push برای دستگاه‌های دارای مجوز
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="sms" />
              پیامک با پترن تأییدشده
            </label>
          </fieldset>
        )}
        <Link href="/inbox" className="w-fit text-sm text-secondary underline">
          انصراف و بازگشت به صندوق ورودی
        </Link>
      </InboxForm>
    </section>
  );
}
