import { notFound } from "next/navigation";
import { requireApproved } from "@/modules/auth/session";
import { visibleUnit } from "@/modules/units/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jalaliTime } from "@/lib/dates";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireApproved();
  let unit;
  try {
    unit = await visibleUnit(user, (await params).id);
  } catch {
    notFound();
  }
  return (
    <div className="space-y-5">
      <h1 className="page-heading">واحد {unit.number}</h1>
      <Card>
        <dl className="grid grid-cols-2 gap-6">
          <div>
            <dt className="text-sm text-secondary">طبقه</dt>
            <dd className="mt-2 font-bold">{unit.floor}</dd>
          </div>
          <div>
            <dt className="text-sm text-secondary">وضعیت</dt>
            <dd className="mt-2">
              <Badge tone={unit.active ? "success" : "warning"}>
                {unit.active ? "فعال" : "غیرفعال"}
              </Badge>
            </dd>
          </div>
        </dl>
      </Card>
      <Card>
        <h2 className="font-bold">روابط ثبت‌شده</h2>
        <ul className="divide-y divide-border">
          {unit.memberships.map((m) => (
            <li key={m.id} className="py-4">
              <span>
                {m.user.name} ·{" "}
                {m.kind === "OWNER"
                  ? "مالک"
                  : m.kind === "TENANT"
                    ? "مستأجر"
                    : "نمایندهٔ مجاز"}
              </span>
              <p className="mt-1 text-xs text-secondary">
                {jalaliTime(m.startsAt)} تا{" "}
                {m.endsAt ? jalaliTime(m.endsAt) : "اکنون"}
              </p>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="font-bold">مسئولیت پرداخت شارژ</h2>
        {unit.responsibilities.length ? (
          <ul className="divide-y divide-border">
            {unit.responsibilities.map((r) => (
              <li key={r.id} className="py-3">
                {r.user.name}
                <p className="text-xs text-secondary">
                  {jalaliTime(r.startsAt)} تا{" "}
                  {r.endsAt ? jalaliTime(r.endsAt) : "اکنون"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="page-description">
            هنوز مسئول تعیین نشده است. هیچ صورتحسابی در فاز اول صادر نمی‌شود.
          </p>
        )}
      </Card>
    </div>
  );
}
