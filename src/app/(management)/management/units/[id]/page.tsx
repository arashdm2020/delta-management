import { UnitContactForm } from "@/modules/units/components/contact-form";
import Link from "next/link";
import { UnitFinance } from "@/modules/billing/components/unit-finance";
import { billingCandidate } from "@/modules/billing/responsibility";
import { notFound } from "next/navigation";
import { requireManager } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { visibleUnit } from "@/modules/units/service";
import { Card } from "@/components/ui/card";
import { ActionForm } from "@/components/shared/action-form";
import { Input } from "@/components/ui/input";
import { jalaliTime } from "@/lib/dates";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireManager();
  let unit;
  try {
    unit = await visibleUnit(actor, (await params).id);
  } catch {
    notFound();
  }
  const savedContacts = await db.unitContact.findMany({
    where: { unitId: unit.id },
  });
  const users = await db.user.findMany({
    where: { status: "APPROVED" },
    select: { id: true, name: true, phone: true },
    take: 200,
    orderBy: { name: "asc" },
  });
  const memberAccounts = await db.user.findMany({
    where: { id: { in: unit.memberships.map((m) => m.userId) } },
    select: { id: true, phone: true, status: true },
  });
  const contacts = [
    ...savedContacts.map((c) => ({
      kind: c.kind,
      name: c.name,
      phone: c.phone,
    })),
  ];
  const payer = await billingCandidate(db, unit.id, new Date());
  return (
    <div className="min-w-0 space-y-6 break-words [&_select]:min-w-0 [&_select]:max-w-full [&_select]:w-full [&_form]:min-w-0 [&_label]:min-w-0">
      <h2 className="text-xl font-bold">واحد {unit.number}</h2>
      <div className="flex flex-wrap gap-3">
        <Link className="nav-extra bg-white text-primary" href="#statement">
          حساب واحد
        </Link>
        <Link className="nav-extra bg-white text-primary" href="#charge">
          ثبت بدهی
        </Link>
        <Link className="nav-extra bg-white text-primary" href="#payments">
          پرداخت
        </Link>
        <Link
          className="nav-extra bg-white text-primary"
          href={`/management/communications?unit=${unit.id}#board-sms`}
        >
          پیامک
        </Link>
      </div>
      <p>
        {unit.occupancy === "OCCUPIED"
          ? "دارای ساکن"
          : unit.occupancy === "VACANT"
            ? "خالی"
            : "سکونت نامشخص"}{" "}
        · {unit.active ? "فعال" : "غیرفعال"}
      </p>
      <p>
        مسئول پرداخت:{" "}
        {payer.assigned?.user.name ?? payer.member?.user.name ?? payer.issue}
      </p>
      <UnitFinance actor={actor} unitId={unit.id} />
      <Card>
        <details>
          <summary className="mb-3 cursor-pointer font-bold">
            ویرایش اطلاعات تماس مالک و مستأجر
          </summary>
          <div className="grid gap-8 lg:grid-cols-2">
            <UnitContactForm
              unitId={unit.id}
              kind="OWNER"
              contact={contacts.find((c) => c.kind === "OWNER")}
            />
            <UnitContactForm
              unitId={unit.id}
              kind="TENANT"
              contact={contacts.find((c) => c.kind === "TENANT")}
            />
          </div>
        </details>
      </Card>
      <Card>
        <h3 className="mb-3 font-bold">افزودن ساکن مستقل</h3>
        <p className="mb-4 text-sm text-secondary">
          هر شخص با شمارهٔ خودش وارد می‌شود. افزودن شخص دوم، ساکن قبلی یا مسئول
          پرداخت را جایگزین نمی‌کند.
        </p>
        <ActionForm label="افزودن ساکن" className="sm:grid-cols-2">
          <input name="operation" value="unit-resident" type="hidden" />
          <input name="unitId" value={unit.id} type="hidden" />
          <label className="field">
            نام و نام خانوادگی
            <Input name="name" minLength={3} maxLength={100} required />
          </label>
          <label className="field">
            شماره همراه مستقل
            <Input name="phone" type="tel" dir="ltr" required maxLength={40} />
          </label>
          <label className="field">
            نوع سکونت فرد جدید
            <select name="kind">
              <option value="TENANT">مستأجر</option>
              <option value="OWNER">مالک</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input name="approveAccess" type="checkbox" defaultChecked />
            فعال‌سازی دسترسی حساب
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input name="primary" type="checkbox" />
            انتخاب به‌عنوان تماس اصلی این نوع
          </label>
        </ActionForm>
      </Card>
      <Card>
        <h3 className="mb-3 font-bold">جایگاه فیزیکی در طبقه</h3>
        <p className="mb-4 text-sm text-secondary">
          شمارهٔ واحد ترتیب واقعی همسایگی را تعیین نمی‌کند. جایگاه‌ها از راست به
          چپ هستند. برای تغییر واحد ادغام‌شده، ابتدا گروه فیزیکی را پایان دهید.
        </p>
        <ActionForm label="ذخیرهٔ جایگاه">
          <input name="operation" value="layout-position" type="hidden" />
          <input name="unitId" value={unit.id} type="hidden" />
          <label className="field">
            جایگاه در ردیف
            <select name="position" defaultValue={unit.physicalPosition || ""}>
              <option value="">خودکار بر اساس شماره</option>
              <option value="1">۱ · راست</option>
              <option value="2">۲ · میانی</option>
              <option value="3">۳ · چپ</option>
            </select>
          </label>
        </ActionForm>
      </Card>
      <Card>
        <h3 className="mb-5 font-bold">اطلاعات واحد</h3>
        <ActionForm className="sm:grid-cols-2">
          <input name="operation" type="hidden" value="unit" />
          <input name="id" type="hidden" value={unit.id} />
          <label className="field">
            شماره
            <Input
              name="number"
              defaultValue={unit.number}
              required
              maxLength={30}
            />
          </label>
          <label className="field">
            طبقه
            <Input
              name="floor"
              defaultValue={unit.floor}
              required
              maxLength={30}
            />
          </label>
          <label className="field">
            سکونت
            <select name="occupancy" defaultValue={unit.occupancy}>
              <option value="UNKNOWN">نامشخص</option>
              <option value="VACANT">خالی</option>
              <option value="OCCUPIED">دارای ساکن</option>
            </select>
          </label>
          <label className="flex min-h-12 items-center gap-3">
            <input name="active" type="checkbox" defaultChecked={unit.active} />
            واحد فعال
          </label>
        </ActionForm>
      </Card>
      <Card id="occupants">
        <h3 className="mb-5 font-bold">مالک، مستأجر و سایر افراد مرتبط</h3>
        {users.length ? (
          <ActionForm label="افزودن ارتباط">
            <input name="operation" type="hidden" value="membership" />
            <input name="unitId" type="hidden" value={unit.id} />
            <label className="field">
              کاربر تأییدشده
              <select name="userId" required>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.phone}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              نوع ارتباط
              <select name="kind">
                <option value="OWNER">مالک</option>
                <option value="TENANT">مستأجر</option>
                <option value="AUTHORIZED">شخص مجاز برای مسئولیت پرداخت</option>
              </select>
            </label>
          </ActionForm>
        ) : (
          <p className="page-description">
            ابتدا کاربر را در بخش کاربران تأیید کنید.
          </p>
        )}
        <ul className="mt-5 divide-y divide-border">
          {unit.memberships.map((m) => (
            <li key={m.id} className="py-4">
              <p className="font-medium">
                {m.user.name} ·{" "}
                {m.kind === "OWNER"
                  ? "مالک"
                  : m.kind === "TENANT"
                    ? "مستأجر"
                    : "نمایندهٔ مجاز"}
              </p>
              <p className="text-xs text-secondary" dir="ltr">
                {memberAccounts.find((u) => u.id === m.userId)?.phone}
              </p>
              <p className="mb-3 text-xs text-secondary">
                {jalaliTime(m.startsAt)} تا{" "}
                {m.endsAt ? jalaliTime(m.endsAt) : "اکنون"}
              </p>
              {!m.endsAt && (
                <ActionForm label="پایان ارتباط">
                  <input
                    name="operation"
                    type="hidden"
                    value="membership-end"
                  />
                  <input name="id" type="hidden" value={m.id} />
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="mb-2 font-bold">مسئول پرداخت شارژ</h3>
        <p className="page-description mb-5">
          در حالت عادی، مستأجر فعال و در نبود مستأجر، مالک مسئول است. برای چند
          مستأجر یا استثنا، مسئول تعیین کنید. برای رفع ابهام در صدور شارژ ماه
          جاری یا گذشته، ماه موردنظر را وارد کنید.
        </p>
        {unit.memberships.length ? (
          <ActionForm label="تعیین مسئول">
            <input name="operation" type="hidden" value="billing" />
            <input name="unitId" type="hidden" value={unit.id} />
            <label className="field">
              مسئول مجاز
              <select name="membershipId" required>
                {unit.memberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.user.name} ·{" "}
                    {m.kind === "OWNER"
                      ? "مالک"
                      : m.kind === "TENANT"
                        ? "مستأجر"
                        : "نماینده"}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              ماه مشخص (اختیاری، سال-ماه)
              <Input name="period" dir="ltr" maxLength={7} />
            </label>
            <label className="field">
              دلیل تعیین مسئول
              <Input name="reason" minLength={3} maxLength={500} required />
            </label>
          </ActionForm>
        ) : (
          <p className="page-description">ارتباط فعال لازم است.</p>
        )}
        <ul className="mt-5 divide-y divide-border">
          {unit.responsibilities.map((r) => (
            <li key={r.id} className="py-3">
              {r.user.name}
              <p className="text-xs text-secondary">
                {jalaliTime(r.startsAt)} تا{" "}
                {r.endsAt ? jalaliTime(r.endsAt) : "اکنون"}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
