import Link from "next/link";
import { requireApproved } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/shared/empty";
import { Badge } from "@/components/ui/badge";
export default async function Units() {
  const user = await requireApproved();
  const memberships = await db.unitMembership.findMany({
    where: { userId: user.id, endsAt: null, startsAt: { lte: new Date() } },
    include: { unit: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">واحدهای من</h1>
        <p className="page-description">
          اطلاعات واحدهایی که مدیریت به حساب شما متصل کرده است.
        </p>
      </div>
      {memberships.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {memberships.map((m) => (
            <Card key={m.id}>
              <div className="flex items-center justify-between">
                <h2 className="font-bold">واحد {m.unit.number}</h2>
                <Badge tone={m.unit.active ? "success" : "warning"}>
                  {m.unit.active ? "فعال" : "غیرفعال"}
                </Badge>
              </div>
              <p className="page-description">
                طبقه {m.unit.floor} ·{" "}
                {m.kind === "OWNER"
                  ? "مالک"
                  : m.kind === "TENANT"
                    ? "مستأجر"
                    : "نمایندهٔ مجاز"}
              </p>
              <Link
                href={"/units/" + m.unit.id}
                className="mt-5 inline-block text-sm text-primary underline"
              >
                مشاهدهٔ جزئیات
              </Link>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Empty
            title="هنوز واحدی متصل نیست"
            description="مدیریت می‌تواند رابطهٔ مالکیت یا سکونت شما را ثبت کند."
          />
        </Card>
      )}
    </div>
  );
}
