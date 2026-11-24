import Link from "next/link";
import { db } from "@/lib/db";
import { requireManager } from "@/modules/auth/session";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/shared/action-form";
import { Empty } from "@/components/shared/empty";
import { z } from "zod";
export default async function Units({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; active?: string }>;
}) {
  await requireManager();
  const filters = z
    .object({
      q: z.string().max(50).optional(),
      active: z.enum(["true", "false"]).optional(),
    })
    .parse(await searchParams);
  const units = await db.unit.findMany({
    where: {
      ...(filters.q
        ? {
            OR: [
              { number: { contains: filters.q } },
              { floor: { contains: filters.q } },
            ],
          }
        : {}),
      ...(filters.active ? { active: filters.active === "true" } : {}),
    },
    orderBy: { number: "asc" },
    include: {
      contacts: { select: { kind: true, name: true } },
      memberships: {
        where: { endsAt: null, startsAt: { lte: new Date() } },
        select: { kind: true, user: { select: { name: true } } },
      },
      _count: {
        select: {
          memberships: {
            where: { endsAt: null, startsAt: { lte: new Date() } },
          },
        },
      },
    },
  });
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-5 text-lg font-bold">واحدهای ساختمان</h2>
        <form className="flex flex-wrap gap-3">
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="جست‌وجوی شماره یا طبقه"
            aria-label="جست‌وجوی واحد"
            className="flex-1"
          />
          <select
            name="active"
            aria-label="وضعیت واحد"
            defaultValue={filters.active || ""}
          >
            <option value="">همهٔ وضعیت‌ها</option>
            <option value="true">فعال</option>
            <option value="false">غیرفعال</option>
          </select>
          <button className="rounded-xl bg-primary px-5 text-sm text-white">
            جست‌وجو
          </button>
        </form>
        {units.length ? (
          <ul className="mt-5 divide-y divide-border">
            {units.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div>
                  <Link
                    className="font-bold text-primary"
                    href={"/management/units/" + u.id}
                  >
                    واحد {u.number}
                  </Link>
                  <p className="mt-2 text-sm text-secondary">
                    {[
                      ...new Set([
                        ...u.contacts.map(
                          (c) =>
                            `${c.kind === "OWNER" ? "مالک" : "مستأجر"}: ${c.name}`,
                        ),
                        ...u.memberships.map(
                          (m) =>
                            `${m.kind === "OWNER" ? "مالک" : m.kind === "TENANT" ? "مستأجر" : "نماینده"}: ${m.user.name || "نام ثبت نشده"}`,
                        ),
                      ]),
                    ].join(" · ") || "اطلاعات مالک و مستأجر هنوز ثبت نشده است"}
                  </p>
                  <p className="text-sm text-secondary">
                    طبقه {u.floor} ·{" "}
                    {new Intl.NumberFormat("fa-IR").format(
                      u._count.memberships,
                    )}{" "}
                    ارتباط فعال
                  </p>
                </div>
                <Badge tone={u.active ? "success" : "warning"}>
                  {u.active ? "فعال" : "غیرفعال"}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title="واحدی پیدا نشد"
            description="شماره و طبقهٔ واقعی واحدهای دلتا را وارد کنید."
          />
        )}
      </Card>
      <Card>
        <h2 className="mb-5 font-bold">ثبت واحد جدید</h2>
        <p className="page-description mb-5">
          حداکثر ۱۸ واحد؛ ابتدا واحد را ثبت کنید، سپس با انتخاب شمارهٔ آن، نام و
          شمارهٔ مالک و مستأجر را پیش از ورودشان اضافه کنید.
        </p>
        <ActionForm label="ثبت واحد" className="sm:grid-cols-2">
          <input type="hidden" name="operation" value="unit" />
          <label className="field">
            شمارهٔ واحد
            <Input name="number" required maxLength={30} />
          </label>
          <label className="field">
            طبقه
            <Input name="floor" required maxLength={30} />
          </label>
          <label className="field">
            وضعیت سکونت
            <select name="occupancy">
              <option value="UNKNOWN">نامشخص</option>
              <option value="VACANT">خالی</option>
              <option value="OCCUPIED">دارای ساکن</option>
            </select>
          </label>
          <label className="flex min-h-12 items-center gap-3">
            <input name="active" type="checkbox" defaultChecked />
            واحد فعال است
          </label>
        </ActionForm>
      </Card>
    </div>
  );
}
