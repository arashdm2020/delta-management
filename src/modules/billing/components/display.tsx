import { Badge } from "@/components/ui/badge";
import { rialToToman } from "@/lib/utils";
export function Money({ amount }: { amount: bigint }) {
  return (
    <span className="break-words tabular-nums">{rialToToman(amount)}</span>
  );
}
export function FinanceStatus({ status }: { status: string }) {
  return (
    <Badge
      tone={
        status === "پرداخت‌شده" || status === "VERIFIED" ? "success" : "neutral"
      }
    >
      {(
        {
          ISSUED: "صادرشده",
          CANCELLED: "لغوشده",
          PENDING: "در انتظار تأیید",
          CREATING: "در حال ایجاد",
          RETRY: "نیازمند بررسی مجدد",
          VERIFIED: "پرداخت تأییدشده",
          FAILED: "ناموفق",
          DRAFT: "پیش‌نویس",
          POSTED: "ثبت قطعی",
          PAID: "پرداخت‌شده",
          REVERSED: "برگشت‌شده",
        } as Record<string, string>
      )[status] || status}
    </Badge>
  );
}
export function Totals({
  items,
}: {
  items: { label: string; amount: bigint }[];
}) {
  return (
    <dl className="grid gap-x-6 gap-y-4 rounded-2xl border border-border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-sm text-secondary">{item.label}</dt>
          <dd className="mt-2 text-lg font-bold">
            <Money amount={item.amount} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function StatusTable({
  rows,
}: {
  rows: {
    unitNumber: string;
    period: string;
    amount: bigint;
    paid: bigint;
    outstanding: bigint;
    status: string;
  }[];
}) {
  if (!rows.length)
    return (
      <p className="rounded-2xl bg-white p-6 text-sm text-secondary">
        برای این ماه هنوز صورتحساب صادر نشده است.
      </p>
    );
  const month = (value: string) =>
    value.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  return (
    <section
      aria-label="وضعیت شارژ واحدها"
      className="rounded-2xl border border-border bg-white"
    >
      <h2 className="p-4 text-base font-bold">
        وضعیت شارژ واحدها — بدون اطلاعات شخصی
      </h2>
      <div className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <article key={row.unitNumber} className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold">واحد {row.unitNumber}</h3>
              <FinanceStatus status={row.status} />
            </div>
            <p className="text-xs text-secondary">ماه {month(row.period)}</p>
            <dl className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-3">
              {[
                { label: "شارژ", amount: row.amount },
                { label: "پرداخت", amount: row.paid },
                { label: "مانده", amount: row.outstanding },
              ].map((item) => (
                <div key={item.label} className="min-w-0">
                  <dt className="text-xs text-secondary">{item.label}</dt>
                  <dd className="mt-1 text-sm">
                    <Money amount={item.amount} />
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-right text-sm">
          <thead className="border-y border-border bg-soft">
            <tr>
              {["واحد", "ماه", "شارژ", "پرداخت", "مانده", "وضعیت"].map(
                (label) => (
                  <th key={label} scope="col" className="p-3">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.unitNumber}
                className="border-b border-border last:border-0"
              >
                <th scope="row" className="p-3">
                  {row.unitNumber}
                </th>
                <td className="p-3" dir="ltr">
                  {month(row.period)}
                </td>
                <td className="p-3">
                  <Money amount={row.amount} />
                </td>
                <td className="p-3">
                  <Money amount={row.paid} />
                </td>
                <td className="p-3">
                  <Money amount={row.outstanding} />
                </td>
                <td className="p-3">
                  <FinanceStatus status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
