import Link from "next/link";
import { requireManager } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { jalaliTime } from "@/lib/dates";
import { z } from "zod";
import { Input } from "@/components/ui/input";
export default async function Audit({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireManager();
  const f = z
    .object({
      action: z.string().max(100).optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    })
    .parse(await searchParams);
  const logs = await db.auditLog.findMany({
    where: f.action ? { action: f.action } : {},
    include: { actor: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 31,
    skip: (f.page - 1) * 30,
  });
  const labels: Record<string, string> = {
    "unit.save": "ثبت یا ویرایش واحد",
    "membership.start": "شروع رابطه با واحد",
    "membership.end": "پایان رابطه با واحد",
    "billing.assign": "تعیین مسئول پرداخت",
    "user.approved": "تأیید کاربر",
    "user.suspended": "تعلیق کاربر",
    "board.assign": "ثبت عضو هیئت‌مدیره",
    "board.end": "پایان عضویت هیئت‌مدیره",
    "profile.update": "ویرایش پروفایل",
    "auth.login": "ورود به حساب",
    "auth.logout": "خروج از حساب",
    "auth.otp.request": "درخواست کد ورود",
    "auth.otp.failed": "کد ورود نامعتبر",
    "auth.sessions.revoke": "لغو همهٔ نشست‌ها",
    "security.admin.bootstrap": "راه‌اندازی صریح مدیر ارشد",
    "building.update": "ویرایش ساختمان",
  };
  return (
    <Card>
      <h2 className="mb-5 font-bold">تاریخچهٔ غیرقابل ویرایش</h2>
      <form className="mb-5 flex gap-3">
        <Input
          name="action"
          defaultValue={f.action}
          placeholder="شناسهٔ اقدام؛ مانند unit.save"
          aria-label="فیلتر اقدام"
        />
        <button className="rounded-xl bg-primary px-4 text-sm text-white">
          فیلتر
        </button>
      </form>
      <ul className="divide-y divide-border">
        {logs.slice(0, 30).map((log) => (
          <li key={log.id} className="py-4">
            <h3 className="font-semibold">
              {labels[log.action] || log.action}
            </h3>
            <p className="mt-1 text-sm text-secondary">
              {log.actor?.name || "سامانه"} · {jalaliTime(log.createdAt)}
            </p>
            {log.targetId && (
              <p dir="ltr" className="mt-1 break-all text-xs text-secondary">
                {log.targetId}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex gap-5 text-sm text-primary">
        {f.page > 1 && (
          <Link
            href={
              "?page=" +
              (f.page - 1) +
              (f.action ? "&action=" + encodeURIComponent(f.action) : "")
            }
          >
            صفحه قبل
          </Link>
        )}
        {logs.length > 30 && (
          <Link
            href={
              "?page=" +
              (f.page + 1) +
              (f.action ? "&action=" + encodeURIComponent(f.action) : "")
            }
          >
            صفحه بعد
          </Link>
        )}
      </div>
    </Card>
  );
}
