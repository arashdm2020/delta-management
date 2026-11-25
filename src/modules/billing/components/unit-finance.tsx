import Link from "next/link";
import { randomUUID } from "node:crypto";
import { FinanceForm } from "@/modules/billing/components/form";
import { currentPeriod } from "@/modules/billing/calendar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { rialToToman } from "@/lib/utils";
import { jalaliTime } from "@/lib/dates";
import { db } from "@/lib/db";
import { manager } from "@/modules/accounting/service";
import { receivableEntries } from "@/modules/accounting/receivables";
import type { Actor } from "@/lib/security/core";

function Amount() {
  return (
    <label className="field">
      مبلغ (تومان)
      <Input name="amount" inputMode="numeric" required />
    </label>
  );
}
function Reason({ label = "دلیل و مرجع سند" }: { label?: string }) {
  return (
    <label className="field">
      {label}
      <Input name="reason" minLength={3} maxLength={300} required />
    </label>
  );
}
function AccountSelect({
  accounts,
}: {
  accounts: { id: string; name: string }[];
}) {
  return (
    <label className="field">
      حساب دریافت
      <select name="financialAccountId" required>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export async function UnitFinance({
  actor,
  unitId,
}: {
  actor: Actor;
  unitId: string;
}) {
  manager(actor);
  const { entries, debts, invoices, accounts, periods } = await db.$transaction(
    async (tx) => {
      const [allEntries, debts, invoices, accounts, periods] =
        await Promise.all([
          receivableEntries(tx),
          tx.unitDebt.findMany({ where: { unitId } }),
          tx.invoice.findMany({
            where: { unitId },
            orderBy: { issuedAt: "desc" },
          }),
          tx.financialAccount.findMany(),
          tx.billingPeriod.findMany({ select: { id: true, key: true } }),
        ]);
      return {
        entries: allEntries.filter((entry) => entry.unitId === unitId),
        debts,
        invoices,
        accounts,
        periods,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
  const labels = new Map([
    ...debts.map(
      (debt) => [debt.id, debt.description + " · " + debt.periodKey] as const,
    ),
    ...invoices.map(
      (invoice) =>
        [
          invoice.id,
          "شارژ " + (periods.find((p) => p.id === invoice.periodId)?.key ?? ""),
        ] as const,
    ),
  ]);
  const balances = new Map<string, bigint>();
  for (const entry of entries) {
    if (entry.obligationId)
      balances.set(
        entry.obligationId,
        (balances.get(entry.obligationId) ?? 0n) + entry.delta,
      );
  }
  return (
    <>
      <Card id="statement" className="scroll-mt-6">
        <h3 className="font-bold">صورتحساب واحد · همه دوره‌ها</h3>
        <p className="mt-2">
          مانده:{" "}
          {rialToToman(entries.reduce((sum, item) => sum + item.delta, 0n))}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr>
                <th scope="col">تاریخ</th>
                <th scope="col">تعهد و شرح</th>
                <th scope="col">بدهکار</th>
                <th scope="col">بستانکار</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border">
                  <td className="py-2">{jalaliTime(entry.occurredAt)}</td>
                  <td className="py-2">
                    {labels.get(entry.obligationId ?? "")} · {entry.description}
                  </td>
                  <td>{entry.delta > 0n ? rialToToman(entry.delta) : "—"}</td>
                  <td>{entry.delta < 0n ? rialToToman(-entry.delta) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!entries.length && (
            <p className="mt-3 text-secondary">سند مالی ثبت نشده است.</p>
          )}
        </div>
      </Card>
      <Card id="charge" className="scroll-mt-6">
        <h3 className="mb-3 font-bold">ثبت بدهی این واحد</h3>
        <p className="mb-3 text-sm text-secondary">
          ماندهٔ انتقالی را فقط برای مبالغی ثبت کنید که جداگانه به عنوان شارژ
          ماهانه یا بدهی تاریخی وارد نشده‌اند.
        </p>
        <FinanceForm
          operation="unit-debt"
          label="ثبت سند بدهی"
          className="sm:grid-cols-2"
        >
          <input type="hidden" name="unitId" value={unitId} />
          <input type="hidden" name="requestKey" value={randomUUID()} />
          <label className="field">
            نوع بدهی
            <select name="kind">
              <option value="HISTORICAL">شارژ پرداخت‌نشدهٔ ماه قبل</option>
              <option value="OPENING">ماندهٔ انتقالی ابتدای دوره</option>
              <option value="MISC">هزینهٔ موردی</option>
            </select>
          </label>
          <label className="field">
            ماه شمسی (سال-ماه)
            <Input
              name="period"
              dir="ltr"
              defaultValue={currentPeriod()}
              maxLength={7}
              required
            />
          </label>
          <Amount />
          <label className="field">
            شمارهٔ یکتای مرجع
            <Input name="reference" minLength={3} maxLength={100} required />
          </label>
          <Reason label="شرح بدهی" />
        </FinanceForm>
      </Card>
      <Card id="payments" className="scroll-mt-6">
        <h3 className="mb-3 font-bold">پرداخت‌ها و اصلاح تعهدات</h3>
        <ul className="mb-4 space-y-2 text-sm">
          {entries
            .filter(
              (item) =>
                item.originalSource.startsWith("payment:") ||
                item.originalSource.split(":")[2] === "payment",
            )
            .map((item) => (
              <li key={item.id}>
                {jalaliTime(item.occurredAt)} · {item.description} ·{" "}
                {rialToToman(-item.delta)}
              </li>
            ))}
        </ul>
        {!invoices.length && !debts.length && (
          <p className="text-sm text-secondary">تعهدی ثبت نشده است.</p>
        )}
        {invoices.map((invoice) => {
          const balance = balances.get(invoice.id) ?? 0n;
          return (
            <details key={invoice.id} className="border-t border-border py-3">
              <summary className="cursor-pointer">
                {labels.get(invoice.id)} · {rialToToman(balance)}
              </summary>
              <Link
                className="my-3 inline-block text-primary underline"
                href={"/charges/invoices/" + invoice.id}
              >
                صورتحساب و اصلاحیه
              </Link>
              {balance > 0n && accounts.length > 0 && (
                <FinanceForm
                  operation="manual-payment"
                  label="ثبت پرداخت به این صورتحساب"
                >
                  <input type="hidden" name="id" value={invoice.id} />
                  <input type="hidden" name="requestKey" value={randomUUID()} />
                  <Amount />
                  <AccountSelect accounts={accounts} />
                  <Reason />
                </FinanceForm>
              )}
            </details>
          );
        })}
        {debts.map((debt) => (
          <details key={debt.id} className="border-t border-border py-3">
            <summary className="cursor-pointer">
              {labels.get(debt.id)} · {rialToToman(balances.get(debt.id) ?? 0n)}
            </summary>
            <div className="mt-3 grid gap-5 sm:grid-cols-2">
              {(balances.get(debt.id) ?? 0n) > 0n && accounts.length > 0 && (
                <FinanceForm
                  operation="unit-debt-update"
                  label="ثبت پرداخت به این بدهی"
                >
                  <input type="hidden" name="direction" value="payment" />
                  <input type="hidden" name="id" value={debt.id} />
                  <input type="hidden" name="requestKey" value={randomUUID()} />
                  <Amount />
                  <AccountSelect accounts={accounts} />
                  <Reason />
                </FinanceForm>
              )}
              <FinanceForm operation="unit-debt-update" label="ثبت اصلاحیه">
                <input type="hidden" name="id" value={debt.id} />
                <input type="hidden" name="requestKey" value={randomUUID()} />
                <label className="field">
                  نوع اصلاحیه
                  <select name="direction">
                    <option value="increase">افزایش</option>
                    <option value="decrease">کاهش</option>
                  </select>
                </label>
                <Amount />
                <Reason />
              </FinanceForm>
              {entries.some(
                (e) =>
                  e.obligationId === debt.id &&
                  !e.reversed &&
                  e.source === e.originalSource,
              ) && (
                <FinanceForm operation="unit-debt-update" label="ثبت سند برگشت">
                  <input type="hidden" name="direction" value="reverse" />
                  <input type="hidden" name="id" value={debt.id} />
                  <input type="hidden" name="requestKey" value={randomUUID()} />
                  <label className="field">
                    سند اصلی
                    <select name="entryId" required>
                      {entries
                        .filter(
                          (e) =>
                            e.obligationId === debt.id &&
                            !e.reversed &&
                            e.source === e.originalSource,
                        )
                        .map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.description} · {jalaliTime(entry.occurredAt)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Reason />
                </FinanceForm>
              )}
            </div>
          </details>
        ))}
      </Card>
    </>
  );
}
