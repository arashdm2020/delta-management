import { requireManager } from "@/modules/auth/session";
import { OverviewScreen } from "@/modules/notifications/components/screens";
import { BoardSmsForm } from "@/modules/sms/board-form";
import { announcementSms } from "@/modules/sms/board";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { floorKey, naturalOrder } from "@/modules/building-layout/layout";
import { jalaliTime } from "@/lib/dates";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  const actor = await requireManager();
  const now = new Date();
  const [{ unit }, units, queued] = await Promise.all([
    searchParams,
    db.unit.findMany({
      where: { active: true, building: { key: "delta" } },
      include: {
        contacts: { where: { phone: { not: null } } },
        memberships: {
          where: {
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            user: { status: "APPROVED" },
          },
          include: { user: { select: { id: true, name: true, phone: true } } },
        },
      },
    }),
    db.auditLog.findMany({
      where: { action: "sms.board.queued" },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  units.sort((a, b) => naturalOrder(a.number, b.number));
  const contacts = new Map<string, { id: string; label: string }>();
  for (const entry of units) {
    for (const { user } of entry.memberships)
      contacts.set(user.id, { id: user.id, label: user.name || user.phone });
    for (const contact of entry.contacts)
      contacts.set(contact.id, {
        id: contact.id,
        label: contact.name + " · " + entry.number,
      });
  }
  const records = await db.auditLog.findMany({
    where: {
      targetId: {
        in: queued.flatMap((row) => (row.targetId ? [row.targetId] : [])),
      },
      action: { in: ["sms.board.result", "sms.board.claimed"] },
    },
  });
  return (
    <div className="space-y-5">
      <OverviewScreen actor={actor} />
      <Card id="board-sms" className="scroll-mt-6">
        <h2 className="text-lg font-bold">پیامک اطلاعیهٔ هیئت‌مدیره</h2>
        <p className="mt-2 text-sm text-secondary">
          این ابزار از پترن تأییدشده استفاده می‌کند. ارسال متن آزاد در دسترس
          نیست.
        </p>
        <BoardSmsForm
          message={announcementSms}
          initialUnit={units.find((u) => u.id === unit)?.id}
          units={units.map((u) => ({ id: u.id, label: "واحد " + u.number }))}
          floors={[...new Set(units.map(floorKey))]
            .sort(naturalOrder)
            .map((floor) => ({ id: floor, label: "طبقه " + floor }))}
          contacts={[...contacts.values()]}
        />
      </Card>
      <Card>
        <h2 className="font-bold">۳۰ ارسال اخیر پیامک هیئت‌مدیره</h2>
        {!queued.length && (
          <p className="text-sm text-secondary">ارسالی ثبت نشده است.</p>
        )}
        <ul className="mt-3 divide-y divide-border text-sm">
          {queued.map((row) => {
            const result = records.find(
              (item) =>
                item.targetId === row.targetId &&
                item.action === "sms.board.result",
            );
            const claimed = records.some(
              (item) =>
                item.targetId === row.targetId &&
                item.action === "sms.board.claimed",
            );
            const status = result
              ? (result.details as { status?: string }).status
              : claimed
                ? "UNCONFIRMED"
                : "QUEUED";
            const suffix = (row.details as { suffix?: string }).suffix;
            return (
              <li key={row.id} className="py-2">
                {jalaliTime(row.createdAt)} · <bdi dir="ltr">••••{suffix}</bdi>{" "}
                ·{" "}
                {status === "SIMULATED"
                  ? "آزمایشی"
                  : status === "ACCEPTED"
                    ? "پذیرفته‌شده توسط ارائه‌دهنده"
                    : status === "QUEUED"
                      ? "در صف"
                      : "نتیجه تأیید نشده"}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
