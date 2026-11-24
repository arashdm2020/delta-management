import Link from "next/link";
import { requireApproved } from "@/modules/auth/session";
import { receipt } from "@/modules/financial-reports/service";
import { FinanceForm } from "@/modules/billing/components/form";
import { Money, FinanceStatus } from "@/modules/billing/components/display";
import { Card } from "@/components/ui/card";
import { jalaliTime } from "@/lib/dates";
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payment = await receipt(await requireApproved(), id);
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="page-heading">
        {payment.status === "VERIFIED" ? "رسید پرداخت شارژ" : "وضعیت پرداخت"}
      </h1>
      <Card>
        <FinanceStatus status={payment.status} />
        <p className="mt-5">واحد {payment.unitNumber}</p>
        <p className="mt-3 text-xl font-bold">
          <Money amount={payment.amount} />
        </p>
        {payment.verifiedAt && (
          <p className="mt-3 text-sm">تأیید {jalaliTime(payment.verifiedAt)}</p>
        )}
        <p className="mt-3 break-all text-xs text-secondary">
          شماره پیگیری داخلی: {payment.id}
        </p>
        <p className="mt-3 text-sm text-secondary">
          تأیید پرداخت به معنی تسویه وجه با بانک ساختمان نیست.
        </p>
      </Card>
      {["PENDING", "RETRY", "CREATING"].includes(payment.status) && (
        <FinanceForm operation="retry" label="بررسی مجدد پرداخت">
          <input type="hidden" name="id" value={id} />
        </FinanceForm>
      )}
      <Link
        className="nav-extra text-primary"
        href={"/charges/invoices/" + payment.invoiceId}
      >
        بازگشت به صورتحساب
      </Link>
    </div>
  );
}
