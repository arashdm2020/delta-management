import { Money } from "./display";
import { digits } from "@/lib/utils";
import { currentPeriod, periodBounds } from "../calendar";
export function DebtStatus({
  rows,
}: {
  rows: {
    unitNumber: string;
    outstanding: bigint;
    unpaidMonths: string[];
    status: string;
  }[];
}) {
  const format = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "long",
  });
  return (
    <section
      aria-label="بدهی انباشته واحدها"
      className="rounded-2xl border border-border bg-white p-5"
    >
      <h2 className="text-lg font-bold">وضعیت کلی بدهی واحدها — همهٔ ماه‌ها</h2>
      <p className="mt-2 text-sm leading-7 text-secondary">
        مجموع بدهی‌های ثبت‌شده پس از کسر پرداخت‌های تأییدشده؛ بدون نام و اطلاعات
        شخصی ساکنان. نبود سابقه به معنی تسویه نیست.
      </p>
      {!rows.length ? (
        <p className="mt-4 text-sm text-secondary">
          هنوز سابقهٔ مالی ثبت نشده است.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.unitNumber}
              className="flex flex-wrap items-start justify-between gap-3 py-4"
            >
              <div>
                <h3 className="font-bold">واحد {row.unitNumber}</h3>
                <p className="mt-2 text-sm">
                  {row.status} · <Money amount={row.outstanding} />
                </p>
              </div>
              <div className="min-w-0 text-sm leading-7 text-secondary">
                {row.unpaidMonths.length ? (
                  <>
                    <p>
                      {digits(row.unpaidMonths.length)} ماه پرداخت‌نشده یا ناقص
                    </p>
                    <p>
                      {row.unpaidMonths
                        .map((key) => format.format(periodBounds(key).startsAt))
                        .join("، ")}
                    </p>
                  </>
                ) : (
                  <p>بدهی ثبت‌شده‌ای باقی نمانده است.</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-secondary">
        نمایش وضعیت تا ماه جاری؛ ماه جاری:{" "}
        {format.format(periodBounds(currentPeriod()).startsAt)}
      </p>
    </section>
  );
}
