import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireApproved } from "@/modules/auth/session";
import { mockEnabled } from "@/modules/payments/providers";
import { accessibleInvoice } from "@/modules/payments/service";
import { FinanceForm } from "@/modules/billing/components/form";
import { Money } from "@/modules/billing/components/display";
import { Card } from "@/components/ui/card";
export default async function MockGateway({
  params,
}: {
  params: Promise<{ authority: string }>;
}) {
  if (!mockEnabled()) notFound();
  const { authority } = await params;
  const intent = await db.paymentIntent.findUniqueOrThrow({
    where: { authority },
  });
  await accessibleInvoice(await requireApproved(), intent.invoiceId);
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="page-heading">درگاه آزمایشی توسعه</h1>
      <Card>
        <p className="text-sm text-secondary">
          هیچ وجه واقعی منتقل نمی‌شود. نتیجه پس از تأیید مستقل سمت سرور ثبت
          خواهد شد.
        </p>
        <p className="my-5 text-xl font-bold">
          <Money amount={intent.amount} />
        </p>
        <FinanceForm operation="mock" label="اجرای پرداخت آزمایشی">
          <input type="hidden" name="authority" value={authority} />
          <label className="field">
            نتیجه آزمایش
            <select name="outcome">
              <option value="SUCCESS">پرداخت موفق</option>
              <option value="FAILED">پرداخت ناموفق</option>
              <option value="CANCELLED">انصراف</option>
              <option value="DELAYED">تأیید با تأخیر ۳۰ ثانیه</option>
              <option value="VERIFY_FAILURE">خطا در تأیید درگاه</option>
            </select>
          </label>
        </FinanceForm>
      </Card>
    </div>
  );
}
