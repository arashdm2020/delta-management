import Link from "next/link";
import { requireApproved } from "@/modules/auth/session";
import { receipts } from "@/modules/financial-reports/service";
import { Card } from "@/components/ui/card";
import { Money } from "@/modules/billing/components/display";
import { jalaliTime } from "@/lib/dates";
export default async function Payments() {
  const rows = await receipts(await requireApproved());
  return (
    <div className="space-y-6">
      <h1 className="page-heading">رسیدهای پرداخت من</h1>
      {rows.length ? (
        rows.map((r) => (
          <Card key={r.id}>
            <h2 className="font-bold">واحد {r.invoice.unitNumber}</h2>
            <p className="my-3">
              <Money amount={r.amount} />
            </p>
            <p className="text-sm text-secondary">
              {r.verifiedAt && jalaliTime(r.verifiedAt)}
            </p>
            <Link
              className="nav-extra text-primary"
              href={"/payments/receipt/" + r.id}
            >
              مشاهده رسید
            </Link>
          </Card>
        ))
      ) : (
        <Card>
          <p className="text-sm text-secondary">
            پرداخت تأییدشده‌ای ثبت نشده است.
          </p>
        </Card>
      )}
      <Link className="nav-extra text-primary" href="/charges">
        مشاهده صورتحساب‌ها
      </Link>
    </div>
  );
}
