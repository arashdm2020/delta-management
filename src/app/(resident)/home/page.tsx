import { DebtStatus } from "@/modules/billing/components/debt-status";
import { unitDebtStatus } from "@/modules/financial-reports/service";
import Link from "next/link";
import {
  Building2,
  Wallet,
  ChartNoAxesColumnIncreasing,
  Megaphone,
  Wrench,
  ChevronLeft,
} from "lucide-react";
import { requireApproved } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { myInvoices, invoiceState } from "@/modules/financial-reports/service";
import { Totals } from "@/modules/billing/components/display";
import { digits } from "@/lib/utils";
export default async function Home() {
  const user = await requireApproved();
  const debtRows = await unitDebtStatus(user);
  const memberships = await db.unitMembership.findMany({
    where: { userId: user.id, endsAt: null, startsAt: { lte: new Date() } },
    include: { unit: true },
  });
  const invoices = await myInvoices(user);
  const quick = [
    {
      title: "شارژ ساختمان",
      body: "صورتحساب‌ها و پرداخت",
      href: "/charges",
      icon: Wallet,
    },
    {
      title: "گزارش مالی",
      body: "درآمد و هزینه‌های ساختمان",
      href: "/reports",
      icon: ChartNoAxesColumnIncreasing,
    },
    {
      title: "اطلاعیه‌ها",
      body: "اخبار و اطلاع‌رسانی ساختمان",
      href: "/announcements",
      icon: Megaphone,
    },
    {
      title: "گزارش مشکل",
      body: "ثبت و پیگیری درخواست‌ها",
      href: "/requests",
      icon: Wrench,
    },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">سلام، {user.name}</h1>
        <p className="page-description">
          به خانهٔ دیجیتال ساختمان دلتا خوش آمدید.
        </p>
      </div>
      <Card className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <span className="text-xs text-secondary">
            واحدهای متصل به حساب شما
          </span>
          <h2 className="mt-2 text-lg font-bold">
            {memberships.length
              ? memberships.map((m) => "واحد " + m.unit.number).join("، ")
              : "نقش مدیریتی ساختمان"}
          </h2>
          <p className="mt-2 text-sm text-secondary">
            {memberships.length
              ? digits(memberships.length) + " ارتباط ثبت‌شده"
              : "برای ثبت واحدهای واقعی به منوی مدیریت بروید."}
          </p>
        </div>
        <Link
          href="/units"
          className="flex min-h-11 items-center gap-1 text-sm font-medium text-primary"
        >
          مشاهدهٔ واحدها
          <ChevronLeft size={16} />
        </Link>
        <Badge>اطلاعات واقعی ثبت‌شده</Badge>
      </Card>
      <Totals
        items={[
          {
            label: "مانده صورتحساب‌های شما",
            amount: invoices.reduce(
              (a, i) => a + invoiceState(i).outstanding,
              0n,
            ),
          },
        ]}
      />
      <DebtStatus rows={debtRows} />
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        {quick.map(({ title, body, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-border/50 bg-white p-5 transition-colors hover:border-primary/30 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon className="mb-4 text-primary" size={23} />
            <h2 className="font-bold sm:text-lg">{title}</h2>
            <p className="mt-1 text-xs leading-6 text-secondary sm:text-sm">
              {body}
            </p>
            <span className="mt-4 inline-block text-xs text-secondary">
              {["/charges", "/reports", "/announcements", "/requests"].includes(
                href,
              )
                ? "مشاهده و پیگیری"
                : "در فاز آینده"}
            </span>
          </Link>
        ))}
      </div>
      <Card>
        <div className="flex items-center gap-3">
          <Building2 className="text-primary" />
          <h2 className="font-bold">نقش شما در ساختمان</h2>
        </div>
        {memberships.length ? (
          <ul className="mt-4 divide-y divide-border">
            {memberships.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span>
                  واحد {m.unit.number} · طبقه {m.unit.floor}
                </span>
                <Badge tone="success">
                  {m.kind === "OWNER"
                    ? "مالک"
                    : m.kind === "TENANT"
                      ? "مستأجر"
                      : "نمایندهٔ مجاز"}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="page-description">
            مدیریت و روابط مالکیت مستقل از یکدیگر ثبت می‌شوند.
          </p>
        )}
      </Card>
    </div>
  );
}
