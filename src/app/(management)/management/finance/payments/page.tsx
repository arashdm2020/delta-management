import Link from "next/link";
import { requireManager } from "@/modules/auth/session";
import { paymentRecords } from "@/modules/financial-reports/service";
import { Money, FinanceStatus } from "@/modules/billing/components/display";
import { Card } from "@/components/ui/card";
import { jalaliTime } from "@/lib/dates";
export default async function PaymentRecords() {
  const records = await paymentRecords(await requireManager());
  return (
    <div className="space-y-6">
      <h2 className="page-heading">سوابق پرداخت و تسویه</h2>
      <Link className="nav-extra text-primary" href="/management/finance">
        بازگشت به امور مالی
      </Link>
      {records.length ? (
        records.map((p) => (
          <Card key={p.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <h3 className="font-bold">واحد {p.invoice.unitNumber}</h3>
              <FinanceStatus status={p.status} />
            </div>
            <p className="my-3">
              <Money amount={p.amount} />
            </p>
            <dl className="grid gap-3 text-sm">
              <div>مسئول صورتحساب: {p.invoice.responsibleName}</div>
              <div>ایجاد: {jalaliTime(p.createdAt)}</div>
              <div>درگاه: {p.provider === "mock" ? "آزمایشی" : p.provider}</div>
              <div className="break-all">شناسه داخلی: {p.id}</div>
              <div className="break-all">
                شناسه تأییدشده درگاه:{" "}
                {p.providerTransactionId || "هنوز تأیید نشده"}
              </div>
              {p.verifiedAt && <div>تأیید: {jalaliTime(p.verifiedAt)}</div>}
              {p.settlement ? (
                <div className="space-y-2">
                  <p>تسویه بانکی: {jalaliTime(p.settlement.settledAt)}</p>
                  <p>
                    کارمزد: <Money amount={p.settlement.fee} />
                  </p>
                  <p className="break-all">مرجع: {p.settlement.reference}</p>
                </div>
              ) : (
                <div>تسویه بانکی ثبت نشده است.</div>
              )}
            </dl>
            <Link
              className="nav-extra text-primary"
              href={"/charges/invoices/" + p.invoiceId}
            >
              صورتحساب مرتبط
            </Link>
          </Card>
        ))
      ) : (
        <Card>
          <p className="text-sm text-secondary">پرداختی ثبت نشده است.</p>
        </Card>
      )}
    </div>
  );
}
