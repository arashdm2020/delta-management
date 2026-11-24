import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { digits } from "@/lib/utils";
import {
  Building2,
  UsersRound,
  UserCheck,
  KeyRound,
  Clock3,
} from "lucide-react";
import { requireManager } from "@/modules/auth/session";
export default async function Management() {
  await requireManager();
  const [units, residents, pending, owners, tenants] = await Promise.all([
    db.unit.count(),
    db.user.count({ where: { status: "APPROVED" } }),
    db.user.count({ where: { status: "PENDING" } }),
    db.unitMembership.findMany({
      where: { kind: "OWNER", endsAt: null },
      distinct: ["userId"],
      select: { userId: true },
    }),
    db.unitMembership.findMany({
      where: { kind: "TENANT", endsAt: null },
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);
  const stats = [
    { label: "واحد ثبت‌شده", value: units, icon: Building2 },
    { label: "کاربر تأییدشده", value: residents, icon: UsersRound },
    { label: "در انتظار تأیید", value: pending, icon: Clock3 },
    { label: "مالک فعال", value: owners.length, icon: KeyRound },
    { label: "مستأجر فعال", value: tenants.length, icon: UserCheck },
  ];
  return (
    <div className="space-y-6">
      <Link className="nav-extra bg-white text-primary" href="/management/communications">ارتباطات، درخواست‌ها و جلسات</Link>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <Icon className="mb-4 text-primary" size={22} />
            <p className="text-sm text-secondary">{label}</p>
            <p className="mt-2 text-3xl font-bold">{digits(value)}</p>
          </Card>
        ))}
      </div>
      <Link
        className="nav-extra bg-white text-primary"
        href="/management/finance"
      >
        امور مالی، صدور شارژ و گزارش‌ها
      </Link>
      <Card>
        <h2 className="font-bold">راه‌اندازی ثبت ساختمان دلتا</h2>
        <p className="page-description">
          ظرفیت ساختمان ۱۸ واحد است. شماره و طبقهٔ واقعی هر واحد را ثبت کنید؛
          واحد یا ساکنی به‌صورت فرضی ایجاد نشده است.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            className="rounded-xl bg-primary px-4 py-3 text-sm text-white"
            href="/management/units"
          >
            ثبت و مدیریت واحدها
          </Link>
          <Link
            className="rounded-xl border border-border px-4 py-3 text-sm text-primary"
            href="/management/users"
          >
            بررسی کاربران
          </Link>
        </div>
      </Card>
    </div>
  );
}
