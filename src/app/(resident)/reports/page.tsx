import { DebtStatus } from "@/modules/billing/components/debt-status";
import { unitDebtStatus } from "@/modules/financial-reports/service";
import { db } from "@/lib/db";
import { requireApproved } from "@/modules/auth/session";
import {
  unitStatus,
  buildingSummary,
} from "@/modules/financial-reports/service";
import { currentPeriod } from "@/modules/billing/calendar";
import { periodSchema } from "@/modules/billing/schemas";
import { Totals, StatusTable } from "@/modules/billing/components/display";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const actor = await requireApproved();
  const debtRows = await unitDebtStatus(actor);
  const key = periodSchema.parse(
    (await searchParams).period || currentPeriod(),
  );
  const rows = await unitStatus(actor, key);
  const totals = await buildingSummary(actor, key);
  const periods = await db.billingPeriod.findMany({
    select: { key: true },
    orderBy: { startsAt: "desc" },
  });
  return (
    <div className="space-y-6">
      <h1 className="page-heading">شفافیت مالی ساختمان</h1>
      <p className="page-description">
        وضعیت شارژ واحدها برای اعضای تأییدشده، بدون اطلاعات هویتی، بانکی یا
        شناسه درگاه.
      </p>
      <form className="flex flex-wrap items-end gap-3">
        <label className="field">
          ماه شمسی
          <select name="period" defaultValue={key}>
            {[...new Set([currentPeriod(), ...periods.map((p) => p.key)])].map(
              (p) => (
                <option key={p} value={p}>
                  {p.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])}
                </option>
              ),
            )}
          </select>
        </label>
        <button className="min-h-12 rounded-xl bg-primary px-5 text-sm text-white">
          نمایش ماه
        </button>
      </form>
      <Totals
        items={[
          { label: "درآمد شناسایی‌شده", amount: totals.revenue },
          { label: "هزینه ثبت‌شده", amount: totals.expenses },
          { label: "نتیجه عملیاتی", amount: totals.revenue - totals.expenses },
        ]}
      />
      <DebtStatus rows={debtRows} />
      <StatusTable rows={rows} />
    </div>
  );
}
