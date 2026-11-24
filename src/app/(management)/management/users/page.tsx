import { requireManager } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/shared/action-form";
import { z } from "zod";
import Link from "next/link";
export default async function Users({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requireManager();
  const f = z
    .object({
      q: z.string().max(50).optional(),
      status: z.enum(["PENDING", "APPROVED", "SUSPENDED"]).optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    })
    .parse(await searchParams);
  const where = {
    ...(f.q
      ? { OR: [{ name: { contains: f.q } }, { phone: { contains: f.q } }] }
      : {}),
    ...(f.status ? { status: f.status } : {}),
  };
  const [users, count] = await Promise.all([
    db.user.findMany({
      where,
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: "desc" },
      take: 25,
      skip: (f.page - 1) * 25,
    }),
    db.user.count({ where }),
  ]);
  return (
    <div className="space-y-5">
      <Card>
        <h2 className="mb-5 font-bold">کاربران و تأیید ثبت‌نام</h2>
        <form className="flex flex-wrap gap-3">
          <Input
            name="q"
            defaultValue={f.q}
            placeholder="نام یا شماره همراه"
            aria-label="جست‌وجوی کاربران"
            className="flex-1"
          />
          <select
            name="status"
            aria-label="وضعیت تأیید"
            defaultValue={f.status || ""}
          >
            <option value="">همه</option>
            <option value="PENDING">در انتظار</option>
            <option value="APPROVED">تأییدشده</option>
            <option value="SUSPENDED">معلق</option>
          </select>
          <button className="rounded-xl bg-primary px-5 text-sm text-white">
            جست‌وجو
          </button>
        </form>
        <p className="page-description">
          تأیید حساب به‌تنهایی دسترسی ساکن ایجاد نمی‌کند؛ ارتباط با واحد هم لازم
          است.
        </p>
      </Card>
      {users.map((user) => (
        <Card key={user.id}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">{user.name || "ثبت‌نام تکمیل نشده"}</h3>
              <p dir="ltr" className="mt-1 text-sm text-secondary">
                {user.phone}
              </p>
              <p className="mt-2 text-xs text-secondary">
                {user.roles
                  .map(
                    (r) =>
                      ({
                        SUPER_ADMIN: "مدیر ارشد",
                        BOARD_MEMBER: "هیئت‌مدیره",
                        OWNER: "مالک",
                        TENANT: "مستأجر",
                      })[r.role.name],
                  )
                  .join("، ") || "بدون نقش مدیریتی"}
              </p>
            </div>
            <Badge
              tone={
                user.status === "APPROVED"
                  ? "success"
                  : user.status === "SUSPENDED"
                    ? "error"
                    : "warning"
              }
            >
              {user.status === "APPROVED"
                ? "تأییدشده"
                : user.status === "SUSPENDED"
                  ? "معلق"
                  : "در انتظار"}
            </Badge>
          </div>
          {user.id !== actor.id &&
            !user.roles.some((r) => r.role.name === "SUPER_ADMIN") && (
              <ActionForm
                label={user.status === "APPROVED" ? "تعلیق حساب" : "تأیید حساب"}
              >
                <input name="operation" type="hidden" value="approval" />
                <input name="userId" type="hidden" value={user.id} />
                <input
                  name="status"
                  type="hidden"
                  value={user.status === "APPROVED" ? "SUSPENDED" : "APPROVED"}
                />
              </ActionForm>
            )}
        </Card>
      ))}
      <div className="flex gap-5 text-sm text-primary">
        {f.page > 1 && (
          <Link
            href={
              "?" +
              new URLSearchParams({ ...f, page: String(f.page - 1) } as Record<
                string,
                string
              >)
            }
          >
            صفحه قبل
          </Link>
        )}
        {count > f.page * 25 && (
          <Link
            href={
              "?" +
              new URLSearchParams({ ...f, page: String(f.page + 1) } as Record<
                string,
                string
              >)
            }
          >
            صفحه بعد
          </Link>
        )}
        <Link href="/management/units">اتصال کاربر به واحد</Link>
      </div>
    </div>
  );
}
