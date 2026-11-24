import Link from "next/link";
import { db } from "@/lib/db";
import { requireManager } from "@/modules/auth/session";
import { FinanceForm } from "@/modules/billing/components/form";
import { Money, FinanceStatus } from "@/modules/billing/components/display";
import { jalaliInput } from "@/modules/billing/calendar";
import { jalali } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
export default async function IncomePage() {
  await requireManager();
  const [accounts, records] = await Promise.all([
    db.financialAccount.findMany(),
    db.income.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return (
    <div className="space-y-6">
      <h2 className="page-heading">درآمدهای غیرشارژ</h2>
      <Link className="nav-extra text-primary" href="/management/finance">
        بازگشت به امور مالی
      </Link>
      <Card>
        <p className="mb-4 text-sm text-secondary">
          فقط واریز واقعی و مستند غیرشارژ را ثبت کنید. پرداخت شارژ و تسویه درگاه
          در این فرم ثبت نمی‌شود.
        </p>
        <FinanceForm operation="income" label="ثبت درآمد مستند">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field">
              مبلغ درآمد (تومان)
              <Input name="amount" inputMode="numeric" required />
            </label>
            <label className="field">
              واریزکننده
              <Input name="payer" required minLength={2} />
            </label>
            <label className="field">
              مرجع سند واریز
              <Input name="reference" required minLength={3} />
            </label>
            <label className="field">
              تاریخ درآمد (شمسی)
              <Input
                name="date"
                dir="ltr"
                required
                defaultValue={jalaliInput()}
              />
            </label>
            <label className="field">
              حساب دریافت
              <select name="financialAccountId">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              شرح درآمد
              <Input name="description" required minLength={3} />
            </label>
          </div>
        </FinanceForm>
      </Card>
      {records.length ? (
        records.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <h3 className="font-bold">{r.description}</h3>
              <FinanceStatus status={r.status} />
            </div>
            <p className="my-3">
              <Money amount={r.amount} />
            </p>
            <p className="break-words text-sm text-secondary">
              {r.payer} · {jalali(r.occurredAt)} · {r.reference}
            </p>
            {r.status === "POSTED" && (
              <div className="mt-4">
                <FinanceForm operation="income-reverse" label="برگشت درآمد">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="field">
                    دلیل برگشت درآمد
                    <Input name="reason" required minLength={3} />
                  </label>
                </FinanceForm>
              </div>
            )}
          </Card>
        ))
      ) : (
        <Card>
          <p className="text-sm text-secondary">درآمد غیرشارژ ثبت نشده است.</p>
        </Card>
      )}
    </div>
  );
}
