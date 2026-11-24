import Link from "next/link";
import { db } from "@/lib/db";
import { requireManager } from "@/modules/auth/session";
import { FinanceForm } from "@/modules/billing/components/form";
import { Money, FinanceStatus } from "@/modules/billing/components/display";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { jalaliInput } from "@/modules/billing/calendar";
import { jalali } from "@/lib/dates";
export default async function Expenses() {
  await requireManager();
  const [categories, accounts, expenses] = await Promise.all([
    db.expenseCategory.findMany(),
    db.financialAccount.findMany(),
    db.expense.findMany({
      include: { documents: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return (
    <div className="space-y-6">
      <h2 className="page-heading">هزینه‌های ساختمان</h2>
      <Link className="nav-extra text-primary" href="/management/finance">
        گزارش و دفتر مالی
      </Link>
      <Card>
        <h3 className="mb-4 text-lg font-bold">ثبت پیش‌نویس هزینه</h3>
        <FinanceForm operation="expense" label="ثبت هزینه">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field">
              دسته هزینه
              <select name="categoryId">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              مبلغ هزینه (تومان)
              <Input name="amount" inputMode="numeric" required />
            </label>
            <label className="field">
              تاریخ سند (شمسی)
              <Input
                name="date"
                inputMode="numeric"
                dir="ltr"
                placeholder="1405-09-02"
                required
                pattern="14[0-9۰-۹]{2}-[0-9۰-۹]{2}-[0-9۰-۹]{2}"
                defaultValue={jalaliInput()}
              />
            </label>
            <label className="field">
              دریافت‌کننده / فروشنده
              <Input name="payee" required minLength={2} />
            </label>
          </div>
          <label className="field">
            شرح هزینه
            <Input name="description" required minLength={3} maxLength={500} />
          </label>
          <label className="field">
            پیوست PDF یا تصویر، حداکثر ۲ مگابایت
            <Input
              name="document"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
            />
          </label>
        </FinanceForm>
      </Card>
      <section className="space-y-4" aria-label="فهرست هزینه‌ها">
        {expenses.length ? (
          expenses.map((e) => (
            <Card key={e.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <h3 className="font-bold">{e.description}</h3>
                <FinanceStatus status={e.status} />
              </div>
              <p className="my-3">
                <Money amount={e.amount} />
              </p>
              <p className="text-sm text-secondary">
                {e.payee} · {jalali(e.occurredAt)}
              </p>
              <div className="my-4 flex flex-wrap gap-3">
                {e.documents.map((d) => (
                  <a
                    key={d.id}
                    className="break-all text-sm text-primary"
                    href={"/api/finance/documents/" + d.id}
                  >
                    {d.name}
                  </a>
                ))}
              </div>
              {e.status === "DRAFT" && (
                <FinanceForm operation="expense-post" label="ثبت قطعی هزینه">
                  <input type="hidden" name="id" value={e.id} />
                </FinanceForm>
              )}
              {e.status === "POSTED" && (
                <FinanceForm operation="expense-pay" label="ثبت پرداخت از بانک">
                  <input type="hidden" name="id" value={e.id} />
                  <label className="field">
                    حساب پرداخت
                    <select name="financialAccountId">
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </FinanceForm>
              )}
              {["POSTED", "PAID"].includes(e.status) && (
                <div className="mt-6">
                  <FinanceForm
                    operation="expense-reverse"
                    label="برگشت اسناد هزینه"
                  >
                    <input type="hidden" name="id" value={e.id} />
                    <label className="field">
                      دلیل برگشت
                      <Input name="reason" required minLength={3} />
                    </label>
                  </FinanceForm>
                </div>
              )}
            </Card>
          ))
        ) : (
          <Card>
            <p className="text-sm text-secondary">هزینه‌ای ثبت نشده است.</p>
          </Card>
        )}
      </section>
    </div>
  );
}
