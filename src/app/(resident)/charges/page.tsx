import { DebtStatus } from "@/modules/billing/components/debt-status";
import { unitDebtStatus } from "@/modules/financial-reports/service";
import Link from "next/link";
import { requireApproved } from "@/modules/auth/session";
import {
  myInvoices,
  invoiceState,
  unitStatus,
} from "@/modules/financial-reports/service";
import { currentPeriod, periodBounds } from "@/modules/billing/calendar";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import {
  Money,
  FinanceStatus,
  Totals,
  StatusTable,
} from "@/modules/billing/components/display";
import { jalali } from "@/lib/dates";
export default async function Charges() {
  const actor = await requireApproved();
  const debtRows = await unitDebtStatus(actor);
  const invoices = await myInvoices(actor);
  const key = currentPeriod();
  const bounds = periodBounds(key);
  const policy = await db.chargePolicy.findFirst({
    where: {
      startsAt: { lte: bounds.startsAt },
      OR: [{ endsAt: null }, { endsAt: { gt: bounds.startsAt } }],
    },
    select: { amount: true },
  });
  const rows = await unitStatus(actor, key);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">شارژ و صورتحساب‌ها</h1>
        <p className="page-description">
          مبالغ به تومان؛ شارژ ماهانه ابتدای هر دوره پرداخت می‌شود.
        </p>
      </div>
      <Card>
        <h2 className="font-bold">شارژ ماهانهٔ ثابت</h2>
        <p className="mt-3">
          پرداخت اول هر ماه؛ مبلغ تا ثبت تغییر مصوب ثابت می‌ماند.
        </p>
      </Card>
      <Totals
        items={[
          { label: "شارژ ماه جاری", amount: policy?.amount || 0n },
          {
            label: "مانده صورتحساب‌های شما",
            amount: invoices.reduce(
              (a, i) => a + invoiceState(i).outstanding,
              0n,
            ),
          },
        ]}
      />
      {!policy && (
        <p className="text-sm text-secondary">
          سیاست شارژ ماه جاری هنوز تعیین نشده است.
        </p>
      )}
      <section aria-label="صورتحساب‌های من" className="space-y-3">
        <h2 className="text-lg font-bold">صورتحساب‌های من</h2>
        {invoices.length ? (
          invoices.map((i) => {
            const state = invoiceState(i);
            return (
              <Card
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-4"
              >
                <div>
                  <h3 className="font-bold">واحد {i.unitNumber}</h3>
                  <p className="text-sm text-secondary">
                    صدور {jalali(i.issuedAt)}
                  </p>
                  <p className="mt-2">
                    <Money amount={state.outstanding} />
                  </p>
                </div>
                <FinanceStatus status={state.status} />
                <Link
                  className="nav-extra text-primary"
                  href={"/charges/invoices/" + i.id}
                >
                  مشاهده و پرداخت
                </Link>
              </Card>
            );
          })
        ) : (
          <Card>
            <p className="text-sm text-secondary">
              صورتحسابی به نام شما صادر نشده است.
            </p>
          </Card>
        )}
      </section>
      <DebtStatus rows={debtRows} />
      <StatusTable rows={rows} />
      <Link className="nav-extra text-primary" href="/payments">
        رسیدهای پرداخت من
      </Link>
    </div>
  );
}
