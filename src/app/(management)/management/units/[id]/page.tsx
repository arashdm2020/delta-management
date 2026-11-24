import { UnitContactForm } from "@/modules/units/components/contact-form";
import { preferredUnitContact } from "@/modules/units/contacts";
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
  const active = unit.memberships.filter((m) => !m.endsAt);
  const contacts = [
    ...savedContacts.map((c) => ({
      kind: c.kind,
      name: c.name,
      phone: c.phone,
    })),
  ];
  for (const kind of ["OWNER", "TENANT"]) {
    if (contacts.some((c) => c.kind === kind)) continue;
    const member = active.find((m) => m.kind === kind);
    const account = users.find((u) => u.id === member?.userId);
    if (account)
      contacts.push({ kind, name: account.name || "", phone: account.phone });
  }
  const preferred = preferredUnitContact(unit, contacts);

  return (
    <div className="min-w-0 space-y-6 break-words [&_select]:min-w-0 [&_select]:max-w-full [&_select]:w-full [&_form]:min-w-0 [&_label]:min-w-0">
      <h2 className="text-xl font-bold">واحد {unit.number}</h2>
      <Card>
        <h3 className="mb-3 font-bold">ثبت مالک و مستأجر پیش از اولین ورود</h3>
        <p className="mb-5 text-sm leading-7 text-secondary">
          اطلاعات هر دو نفر مستقل است. برای واحد فعالِ غیرخالی، شمارهٔ مستأجر در
          اولویت تماس است؛ اگر موجود نباشد شمارهٔ مالک انتخاب می‌شود. این اولویت،
          مسئول پرداخت را عوض نمی‌کند.
        </p>
        <p className="mb-5 text-sm">
          تماس اصلی:{" "}
          {preferred
            ? `${preferred.name} · ${preferred.phone}`
            : "شماره‌ای ثبت نشده است"}
        </p>
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
      <Card>
        <h3 className="mb-5 font-bold">ارتباط مالک، مستأجر یا نماینده</h3>
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
          هر واحد تنها یک مسئول هم‌زمان دارد. با تغییر مسئول، سابقهٔ قبلی بسته و
          حفظ می‌شود.
        </p>
        {active.length ? (
          <ActionForm label="تعیین مسئول">
            <input name="operation" type="hidden" value="billing" />
            <input name="unitId" type="hidden" value={unit.id} />
            <label className="field">
              مسئول مجاز
              <select name="membershipId" required>
                {active.map((m) => (
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
