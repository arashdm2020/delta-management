import Link from "next/link";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireApproved } from "@/modules/auth/session";
import { accessibleInvoice } from "@/modules/payments/service";
import { canManage } from "@/lib/security/core";
import { invoiceState } from "@/modules/financial-reports/service";
import { FinanceForm } from "@/modules/billing/components/form";
import { Money, FinanceStatus } from "@/modules/billing/components/display";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { jalali } from "@/lib/dates";
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireApproved();
  const { id } = await params;
  const invoice = await accessibleInvoice(actor, id);
  const state = invoiceState(invoice);
  const period = await db.billingPeriod.findUniqueOrThrow({
    where: { id: invoice.periodId },
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/charges" className="text-sm text-primary">
        بازگشت به شارژ
      </Link>
      <h1 className="page-heading">صورتحساب واحد {invoice.unitNumber}</h1>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">شارژ {jalali(period.startsAt)}</h2>
          <FinanceStatus status={state.status} />
        </div>
        <dl className="mt-4 grid gap-3 text-sm">
          <div>مسئول در ابتدای دوره: {invoice.responsibleName}</div>
          <div>سررسید: {jalali(period.dueAt)}</div>
          <div>
            مبلغ اولیه: <Money amount={invoice.amount} />
          </div>
          <div>
            مبلغ با اصلاحیه: <Money amount={state.amount} />
          </div>
          <div>
            پرداخت‌شده: <Money amount={state.paid} />
          </div>
          <div className="font-bold">
            مانده: <Money amount={state.outstanding} />
          </div>
        </dl>
      </Card>
      <Card>
        <h2 className="mb-3 font-bold">اقلام و اصلاحیه‌ها</h2>
        {invoice.items.map((item) => (
          <p
            key={item.id}
            className="flex flex-wrap justify-between gap-2 border-b border-border py-3 text-sm"
          >
            {item.description}
            <Money amount={item.amount} />
          </p>
        ))}
        {invoice.corrections.map((c) => (
          <p key={c.id} className="py-3 text-sm">
            {jalali(c.createdAt)} · {c.reason} · <Money amount={c.amount} />
          </p>
        ))}
      </Card>
      {state.outstanding > 0n && invoice.status === "ISSUED" && (
        <FinanceForm operation="pay" label="پرداخت آنلاین">
          <input type="hidden" name="id" value={id} />
        </FinanceForm>
      )}
      {invoice.cancellationReason && (
        <p className="text-sm">دلیل لغو: {invoice.cancellationReason}</p>
      )}
      {invoice.allocations.map((a) => (
        <Link
          className="nav-extra text-primary"
          key={a.id}
          href={"/payments/receipt/" + a.intentId}
        >
          مشاهده رسید پرداخت
        </Link>
      ))}
      {canManage(actor) && invoice.status === "ISSUED" && (
        <Card>
          <h2 className="mb-4 font-bold">اصلاح یا لغو با حفظ سوابق</h2>
          <FinanceForm operation="correct" label="ثبت اصلاحیه">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="requestKey" value={randomUUID()} />
            <label className="field">
              نوع اصلاح
              <select name="direction">
                <option value="debit">افزایش بدهی</option>
                <option value="credit">کاهش بدهی</option>
              </select>
            </label>
            <label className="field">
              مبلغ اصلاحیه (تومان)
              <Input name="amount" inputMode="numeric" required />
            </label>
            <label className="field">
              دلیل اصلاح
              <Input name="reason" required minLength={3} />
            </label>
          </FinanceForm>
          <hr className="my-6 border-border" />
          <FinanceForm operation="cancel" label="لغو صورتحساب">
            <input type="hidden" name="id" value={id} />
            <label className="field">
              دلیل لغو
              <Input name="reason" required minLength={3} />
            </label>
          </FinanceForm>
          <p className="mt-3 text-xs text-secondary">
            صورتحساب دارای پرداخت یا پرداخت در جریان قابل لغو نیست. پس از لغو،
            صدور تکراری همان واحد و ماه مجاز نیست؛ اصلاح مبلغ با اصلاحیه انجام
            می‌شود.
          </p>
        </Card>
      )}
    </div>
  );
}
