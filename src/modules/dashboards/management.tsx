import Link from "next/link";
import type { Actor } from "@/lib/security/core";
import { managementOverview } from "./service";
import { BuildingMap } from "./building-map";
import { Card } from "@/components/ui/card";
import { ActionForm } from "@/components/shared/action-form";
import { Input } from "@/components/ui/input";
import { digits, rialToToman } from "@/lib/utils";
import { jalaliTime } from "@/lib/dates";
export async function ManagementDashboard({ actor }: { actor: Actor }) {
  const data = await managementOverview(actor);
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="page-heading">پنل عملیاتی هیئت‌مدیره</h1>
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="عملیات سریع">
        {[
          ["/management/finance", "صدور شارژ"],
          ["/management/finance/payments", "پرداخت‌ها"],
          ["/management/expenses", "هزینه‌ها"],
          ["/management/communications#board-sms", "ارسال پیامک"],
        ].map(([href, label]) => (
          <Link
            key={href}
            className="nav-extra bg-white text-primary"
            href={href}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "ماندهٔ کل مطالبات", value: rialToToman(data.outstanding) },
          {
            label: "بدهی تاریخی، انتقالی و موردی",
            value: rialToToman(data.otherReceivables),
          },
          {
            label: "شارژ و اصلاحات ثبت‌شدهٔ این ماه",
            value: rialToToman(data.monthlyCharges),
          },
          {
            label: "وصول این ماه",
            value: rialToToman(data.monthlyCollections),
          },
          {
            label: "بدهی ساختمان به تأمین‌کنندگان",
            value: rialToToman(data.payable),
          },
          {
            label: "واحدهای فعال",
            value: digits(data.units.filter((u) => u.active).length),
          },
          {
            label: "واحدهای فعال دارای ساکن",
            value: digits(
              data.units.filter((u) => u.active && u.occupancy === "OCCUPIED")
                .length,
            ),
          },
          {
            label: "واحدهای فعال خالی",
            value: digits(
              data.units.filter((u) => u.active && u.occupancy === "VACANT")
                .length,
            ),
          },
        ].map((s) => (
          <Card key={s.label} className="min-w-0 break-words">
            <p className="text-sm text-secondary">{s.label}</p>
            <p className="mt-3 font-bold">{s.value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="font-bold">ماندهٔ سررسید گذشته به تفکیک واحد</h2>
        {data.units.some((u) => u.overdue > 0n) ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.units
              .filter((u) => u.overdue > 0n)
              .map((u) => (
                <li key={u.id}>
                  <Link
                    className="flex justify-between gap-2 rounded-lg bg-soft p-2 text-primary"
                    href={`/management/units/${u.id}#statement`}
                  >
                    <span>واحد {u.number}</span>
                    <strong>{rialToToman(u.overdue)}</strong>
                  </Link>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-secondary">
            ماندهٔ سررسید گذشته ثبت نشده است.
          </p>
        )}
      </Card>
      <BuildingMap data={data} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            href: "/management/users",
            title: "اعضا و دسترسی‌های غیرفعال",
            value: data.pending,
          },
          {
            href: "/management/tickets",
            title: "درخواست‌های باز",
            value: data.openTickets,
          },
          {
            href: "/management/announcements",
            title: "اطلاعیه‌های منتشرشده",
            value: data.announcements,
          },
          {
            href: "/management/meetings",
            title: "جلسات پیش رو",
            value: data.meetings,
          },
        ].map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="min-w-0 rounded-2xl bg-white p-4 text-primary"
          >
            <span>{s.title}</span>
            <strong className="mt-3 block">{digits(s.value)}</strong>
          </Link>
        ))}
      </div>
      <Card>
        <h2 className="font-bold">درخواست‌های خدمات ساختمان</h2>
        <p className="mt-2 text-sm text-secondary">
          {digits(data.serviceIssues)} درخواست خدماتی باز برای پیگیری وجود دارد.
        </p>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Link
          className="nav-extra bg-white text-primary"
          href="/management/units"
        >
          ثبت و مدیریت واحدها
        </Link>
        <Link
          className="nav-extra bg-white text-primary"
          href="/management/finance"
        >
          امور مالی و شارژ
        </Link>
        <Link
          className="nav-extra bg-white text-primary"
          href="/management/communications"
        >
          ارتباطات ساختمان
        </Link>
      </div>
      <Card className="min-w-0">
        <h2 className="font-bold">گروه‌بندی فیزیکی واحدهای مجاور</h2>
        <p className="my-4 text-sm leading-7 text-secondary">
          فقط ظاهر و ارتباط فیزیکی تغییر می‌کند. صورتحساب، دفتر مالی و مسئول
          پرداخت واحدها مستقل باقی می‌مانند. واحدها باید هم‌طبقه و در جایگاه‌های
          مجاور باشند.
        </p>
        <ActionForm label="ثبت گروه فیزیکی">
          <input name="operation" value="physical-group" type="hidden" />
          <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <legend className="mb-3 text-sm">دو یا سه واحد مجاور</legend>
            {data.units
              .filter(
                (u) =>
                  u.active &&
                  !data.groups.some(
                    (g) =>
                      !g.endsAt && g.members.some((m) => m.unitId === u.id),
                  ),
              )
              .map((u) => (
                <label key={u.id} className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" name="unitIds" value={u.id} />
                  واحد {u.number}
                </label>
              ))}
          </fieldset>
          <label className="field">
            عنوان ساکن یا بهره‌بردار گروه (اختیاری)
            <Input name="occupantLabel" maxLength={100} />
          </label>
        </ActionForm>
        <ul className="mt-5 space-y-5">
          {data.groups.map((g) => (
            <li
              key={g.id}
              id={`physical-group-${g.id}`}
              className="scroll-mt-6 rounded-xl border border-border p-3 min-w-0"
            >
              <p className="font-bold">
                <bdi dir="ltr">{g.label}</bdi>
                {g.occupantLabel ? ` · ${g.occupantLabel}` : ""}
              </p>
              <p className="mt-2 text-xs text-secondary">
                {jalaliTime(g.startsAt)} تا{" "}
                {g.endsAt ? jalaliTime(g.endsAt) : "اکنون"}
              </p>
              {!g.endsAt && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <ActionForm label="پایان گروه فیزیکی">
                    <input
                      name="operation"
                      value="physical-group-end"
                      type="hidden"
                    />
                    <input name="id" value={g.id} type="hidden" />
                  </ActionForm>
                  {g.payerOptions.length ? (
                    <ActionForm label="تعیین پرداخت‌کنندهٔ مشترک">
                      <input
                        name="operation"
                        value="physical-group-payer"
                        type="hidden"
                      />
                      <input name="groupId" value={g.id} type="hidden" />
                      <label className="field">
                        عضو مشترک در تمام واحدها
                        <select name="userId" required>
                          {g.payerOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </ActionForm>
                  ) : (
                    <p className="text-sm text-secondary">
                      برای تعیین پرداخت‌کنندهٔ مشترک، ابتدا همان شخص را به هر
                      واحد مرتبط کنید. ادغام فیزیکی مسئول پرداخت را خودکار تغییر
                      نمی‌دهد.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
