import { DebtStatus } from "@/modules/billing/components/debt-status";
import { unitDebtStatus } from "@/modules/financial-reports/service";
import { PaymentPeriodSelect } from "@/modules/billing/components/period-select";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireManager } from "@/modules/auth/session";
import {
  dashboard,
  unitStatus,
  invoiceState,
} from "@/modules/financial-reports/service";
import { currentPeriod, periodBounds } from "@/modules/billing/calendar";
import { periodSchema } from "@/modules/billing/schemas";
import { FinanceForm } from "@/modules/billing/components/form";
import {
  Totals,
  Money,
  StatusTable,
  FinanceStatus,
} from "@/modules/billing/components/display";
import { rialToToman, digits } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { jalali } from "@/lib/dates";
export default async function Finance({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const actor = await requireManager();
  const debtRows = await unitDebtStatus(actor);
  const query = await searchParams;
  const key = periodSchema.parse(query.period || currentPeriod());
  const bounds = periodBounds(key);
  const activePolicy = await db.chargePolicy.findFirst({
    where: {
      startsAt: { lte: bounds.startsAt },
      OR: [{ endsAt: null }, { endsAt: { gt: bounds.startsAt } }],
    },
    orderBy: { startsAt: "desc" },
  });
  const billingPeriod = await db.billingPeriod.findUnique({ where: { key } });
  const data = await dashboard(actor, key);
  const status = await unitStatus(actor, key);
  const [policies, periods, accounts, payments, invoices, jobs] =
    await Promise.all([
      db.chargePolicy.findMany({ orderBy: { startsAt: "desc" }, take: 30 }),
      db.billingPeriod.findMany({ orderBy: { startsAt: "desc" } }),
      db.financialAccount.findMany(),
      db.paymentIntent.findMany({
        where: { status: "VERIFIED" },
        orderBy: { verifiedAt: "desc" },
        take: 30,
      }),
      db.invoice.findMany({
        include: { allocations: true, corrections: true },
        orderBy: { issuedAt: "desc" },
        take: 100,
      }),
      db.outboxJob.findMany({
        where: { status: { not: "DONE" } },
        orderBy: { availableAt: "asc" },
        take: 10,
      }),
    ]);
  const reconciled = await db.reconciliation.findMany({
    select: { intentId: true },
  });
  const finalMinutes = await db.meetingMinutes.findMany({
    where: {
      status: "FINAL",
      meeting: { status: { not: "CANCELLED" }, startsAt: { lte: new Date() } },
    },
    include: { meeting: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const settled = new Set(reconciled.map((r) => r.intentId));
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h2 className="page-heading">امور مالی ساختمان</h2>
          <p className="page-description">
            ماه شمسی، مبالغ تومان، مانده‌ها از دفتر دوطرفه.
          </p>
        </div>
        <Link className="nav-extra text-primary" href="/management/expenses">
          ثبت و مدیریت هزینه‌ها
        </Link>
      </div>
      <Card>
        <h3 className="mb-4 text-lg font-bold">شارژ ماهانهٔ ثابت</h3>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-secondary">مبلغ ثابت ماهانهٔ هر واحد</dt>
            <dd className="mt-2 font-bold">
              {activePolicy ? (
                <Money amount={activePolicy.amount} />
              ) : (
                "هنوز مبلغ شارژ ثبت نشده است"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-secondary">قاعدهٔ پرداخت</dt>
            <dd className="mt-2 font-bold">
              اول هر ماه؛ مبلغ ثابت تا تصویب تغییر
            </dd>
          </div>
          <div>
            <dt className="text-sm text-secondary">مهلت پرداخت به وقت تهران</dt>
            <dd className="mt-2">
              {jalali(billingPeriod?.dueAt || bounds.dueAt)}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm leading-7 text-secondary">
          مبلغ اولیه یک‌بار ثبت می‌شود و تا تصویب تغییر، هر ماه ثابت می‌ماند.
          ماه شروع فقط ابتدای ثبت بدهی را تعیین می‌کند، نه پایان اعتبار مبلغ.
          تغییر مبلغ به صورتجلسهٔ نهایی نیاز دارد. سوابق قبلی تغییر نمی‌کنند.
        </p>
      </Card>
      <div className="grid gap-6">
        <Card>
          <h3 className="mb-4 text-lg font-bold">
            {policies.length
              ? "تغییر مبلغ با صورتجلسه"
              : "ثبت اولیهٔ شارژ ماهانه"}
          </h3>
          <FinanceForm operation="policy" label="ثبت مبلغ شارژ">
            <label className="field">
              شارژ ماهانه (تومان)
              <Input
                name="amount"
                inputMode="numeric"
                required
                pattern="[0-9۰-۹]+"
              />
            </label>
            <label className="field">
              شروع اعمال مبلغ / اولین ماه مشمول
              <PaymentPeriodSelect value={key} />
            </label>
            {policies.length > 0 && (
              <label className="field">
                صورتجلسهٔ نهایی تصویب تغییر
                <select
                  name="approvalMinutesId"
                  required
                  className="min-h-12 w-full rounded-xl border border-input bg-white px-3"
                >
                  <option value="">صورتجلسه را انتخاب کنید</option>
                  {finalMinutes.map((minutes) => (
                    <option key={minutes.id} value={minutes.id}>
                      {minutes.meeting.title} — نسخهٔ {digits(minutes.version)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              دلیل ثبت / تغییر
              <Input name="reason" minLength={3} maxLength={500} required />
            </label>
          </FinanceForm>
          <p className="mt-4 text-xs leading-6 text-secondary">
            برای ثبت بدهی ماه‌های قبل، اولین ماه مشمول را تعیین و مسئول مالی
            همان زمان را ثبت کنید. پرداخت‌های قبلی باید جداگانه با مدارک ثبت
            شوند؛ مبلغ یا پرداختی فرض نمی‌شود.
          </p>
        </Card>
      </div>
      <form className="flex flex-wrap items-end gap-3">
        <label className="field">
          ماه گزارش
          <PaymentPeriodSelect value={key} />
        </label>
        <button className="min-h-12 rounded-xl bg-primary px-5 text-sm text-white">
          نمایش گزارش
        </button>
      </form>

      <Totals
        items={[
          { label: "شارژ صادرشده این ماه", amount: data.issued },
          { label: "پرداخت وصول‌شده این ماه", amount: data.collected },
          { label: "مطالبات همه دوره‌ها", amount: data.receivables },
          { label: "مانده بانک", amount: data.bank },
          { label: "در انتظار تسویه درگاه", amount: data.clearing },
          { label: "هزینه ثبت‌شده این ماه", amount: data.expenses },
          { label: "نتیجه عملیاتی این ماه", amount: data.net },
          { label: "بدهی پرداختنی", amount: data.payable },
        ]}
      />
      <DebtStatus rows={debtRows} />
      <StatusTable rows={status} />
      <Link
        className="nav-extra bg-white text-primary"
        href="/management/finance/income"
      >
        ثبت و مدیریت درآمد غیرشارژ
      </Link>
      <Link
        className="nav-extra bg-white text-primary"
        href="/management/finance/payments"
      >
        سوابق پرداخت و تسویه
      </Link>
      <Card>
        <h3 className="mb-3 text-lg font-bold">تاریخچه سیاست شارژ</h3>
        {policies.length ? (
          policies.map((p) => (
            <div
              key={p.id}
              className="border-b border-border py-4 text-sm last:border-0"
            >
              <p>
                {jalali(p.startsAt)} · <Money amount={p.amount} />
              </p>
              <p className="mt-2 text-secondary">
                قبلی:{" "}
                {p.previousAmount ? (
                  <Money amount={p.previousAmount} />
                ) : (
                  "اولین سیاست"
                )}{" "}
                · {p.reason}
              </p>
              <p className="mt-2 break-all text-xs text-secondary">
                مدیر ثبت‌کننده: {p.actorId}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-secondary">هنوز سیاستی ثبت نشده است.</p>
        )}
      </Card>
      <Card>
        <h3 className="mb-3 text-lg font-bold">صورتحساب‌ها و اصلاحات</h3>
        {invoices.length ? (
          invoices.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
            >
              <span className="text-sm">
                واحد {i.unitNumber} · <Money amount={invoiceState(i).amount} />
              </span>
              <FinanceStatus status={invoiceState(i).status} />
              <Link
                className="text-sm text-primary"
                href={"/charges/invoices/" + i.id}
              >
                جزئیات و اصلاح
              </Link>
            </div>
          ))
        ) : (
          <p className="text-sm text-secondary">صورتحسابی صادر نشده است.</p>
        )}
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-lg font-bold">مانده ابتدای بانک</h3>
          <FinanceForm operation="opening" label="ثبت مانده اولیه">
            <label className="field">
              حساب بانکی
              <select name="financialAccountId">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              مبلغ اولیه (تومان)
              <Input name="amount" inputMode="numeric" required />
            </label>
            <label className="field">
              مستند و دلیل
              <Input name="reason" minLength={3} required />
            </label>
          </FinanceForm>
          <p className="mt-3 text-xs text-secondary">
            برای هر حساب فقط یک مانده اولیه ثبت می‌شود.
          </p>
        </Card>
        <Card>
          <h3 className="mb-4 text-lg font-bold">ثبت تسویه تأییدشده با بانک</h3>
          {payments.some((p) => !settled.has(p.id)) ? (
            <FinanceForm operation="settle" label="تأیید تسویه بانکی">
              <label className="field">
                پرداخت تأییدشده
                <select name="id">
                  {payments
                    .filter((p) => !settled.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id.slice(0, 8)} · {rialToToman(p.amount)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                بانک مقصد
                <select name="financialAccountId">
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                کارمزد (تومان)
                <Input
                  name="fee"
                  inputMode="numeric"
                  defaultValue="0"
                  required
                />
              </label>
              <label className="field">
                مرجع مستند تسویه
                <Input name="reference" minLength={3} required />
              </label>
            </FinanceForm>
          ) : (
            <p className="text-sm text-secondary">
              پرداختی در انتظار ثبت تسویه نیست.
            </p>
          )}
          <p className="mt-4 text-xs leading-6 text-secondary">
            صرف تأیید درگاه مانده بانک را افزایش نمی‌دهد. فقط پس از تطبیق سند
            تسویه این فرم را ثبت کنید.
          </p>
        </Card>
      </div>
      <Card>
        <h3 className="mb-3 text-lg font-bold">تراز حساب‌ها</h3>
        {data.trial.map((a) => (
          <div
            key={a.code}
            className="flex flex-wrap justify-between gap-3 border-b border-border py-3 text-sm last:border-0"
          >
            <span>{a.name} (بدهکار منهای بستانکار)</span>
            <Money amount={a.balance} />
          </div>
        ))}
      </Card>
      <section className="space-y-4" aria-label="دفتر حسابداری">
        <h3 className="text-lg font-bold">اسناد اخیر حسابداری</h3>
        {data.journals.length ? (
          data.journals.map((j) => (
            <Card key={j.id}>
              <h4 className="font-bold">{j.description}</h4>
              <p className="my-2 text-xs text-secondary">
                {jalali(j.occurredAt)}
                {j.reversalOfId ? " · سند برگشت" : ""}
              </p>
              {j.lines.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                >
                  <span>{l.account.name}</span>
                  <span>
                    {l.debit ? "بدهکار" : "بستانکار"}{" "}
                    <Money amount={l.debit || l.credit} />
                  </span>
                </div>
              ))}
            </Card>
          ))
        ) : (
          <Card>
            <p className="text-sm text-secondary">سندی ثبت نشده است.</p>
          </Card>
        )}
      </section>
      <Card>
        <h3 className="mb-3 font-bold">کارهای در انتظار</h3>
        {jobs.length ? (
          jobs.map((j) => (
            <p key={j.id} className="break-words py-2 text-sm">
              {(
                {
                  GENERATE_INVOICES: "صدور شارژ ماهانه",
                  VERIFY_PAYMENT: "بررسی پرداخت",
                  NOTIFICATION_EVENT: "ثبت رویداد مالی",
                } as Record<string, string>
              )[j.kind] || "عملیات مالی"}{" "}
              ·{" "}
              {
                (
                  {
                    PENDING: "در انتظار",
                    RUNNING: "در حال اجرا",
                    DONE: "انجام‌شده",
                  } as Record<string, string>
                )[j.status]
              }{" "}
              · تلاش {digits(j.attempts)}
              {j.lastError ? " · " + j.lastError : ""}
            </p>
          ))
        ) : (
          <p className="text-sm text-secondary">کاری در انتظار نیست.</p>
        )}
        <p className="mt-3 text-xs text-secondary">
          عملیات زمان‌بندی‌شده در اجرای بعدی پردازش می‌شوند. تأیید و ثبت پرداخت
          به اجرای این صف وابسته نیست.
        </p>
      </Card>
      <p className="text-xs text-secondary">
        {digits(periods.length)} دوره ثبت‌شده. درگاه واقعی تا انتخاب ارائه‌دهنده
        و پیکربندی قرارداد تأیید، فعال نیست.
      </p>
    </div>
  );
}
