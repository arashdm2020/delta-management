import Link from "next/link";
import type { Actor } from "@/lib/security/core";
import { residentOverview } from "./service";
import { invoiceState } from "@/modules/financial-reports/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { rialToToman, digits } from "@/lib/utils";
import { notFound } from "next/navigation";
import { DomainError } from "@/lib/security/core";
import { z } from "zod";
export async function ResidentDashboard({
  actor,
  unitId,
}: {
  actor: Actor & { name?: string | null };
  unitId?: string;
}) {
  const data = await residentOverview(actor, unitId).catch((error) => {
    if (error instanceof DomainError || error instanceof z.ZodError) notFound();
    throw error;
  });
  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h1 className="page-heading">سلام، {actor.name}</h1>
        <p className="page-description">داشبورد واحدهای مرتبط با حساب شما</p>
      </div>
      <Card>
        <h2 className="font-bold">واحدهای من</h2>
        <nav
          aria-label="انتخاب واحد فعال"
          className="mt-4 flex flex-wrap gap-3"
        >
          {data.units.map((u) => (
            <Link
              key={u.id}
              href={`/home?unit=${u.id}`}
              aria-current={u.id === data.selected.id ? "page" : undefined}
              className={`min-h-11 rounded-xl border px-4 py-3 text-sm ${u.id === data.selected.id ? "bg-primary text-white border-primary" : "border-border text-primary"}`}
            >
              واحد {u.number}
            </Link>
          ))}
        </nav>
        <h3 className="mt-5 text-lg font-bold">
          واحد {data.selected.number} · طبقه {data.selected.floor}
        </h3>
        <div className="mt-3 flex gap-2">
          {data.memberships.map((m, i) => (
            <Badge key={i}>
              {m.kind === "OWNER"
                ? "مالک"
                : m.kind === "TENANT"
                  ? "مستأجر"
                  : "نمایندهٔ مجاز"}
            </Badge>
          ))}
        </div>
        <Link
          className="mt-4 block text-primary underline"
          href={`/units/${data.selected.id}`}
        >
          جزئیات واحد
        </Link>
      </Card>
      <Card>
        <h2 className="font-bold">
          صورتحساب‌های مسئولیت پرداخت شما در این واحد
        </h2>
        <p className="mt-3 font-bold">
          مانده:{" "}
          {rialToToman(
            data.invoices.reduce(
              (sum, i) => sum + invoiceState(i).outstanding,
              0n,
            ),
          )}
        </p>
        {!data.invoices.length && (
          <p className="page-description">
            صورتحسابی به مسئولیت پرداخت شما در این واحد ثبت نشده است. هم‌ساکن
            بودن تعهد مالی تکراری ایجاد نمی‌کند.
          </p>
        )}
        <ul className="mt-3 space-y-3">
          {data.invoices.slice(0, 5).map((i) => (
            <li key={i.id}>
              <Link
                className="text-primary underline"
                href={`/charges/invoices/${i.id}`}
              >
                واحد {i.unitNumber} · {invoiceState(i).status} ·{" "}
                {rialToToman(invoiceState(i).outstanding)}
              </Link>
            </li>
          ))}
        </ul>
        <Link className="mt-4 block text-primary" href="/charges">
          همهٔ صورتحساب‌ها و پرداخت
        </Link>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold">پرداخت‌های تأییدشدهٔ این واحد</h2>
          <ul className="mt-4 space-y-3">
            {data.payments.map((p) => (
              <li key={p.id}>
                <Link
                  className="text-primary underline"
                  href={`/payments/receipt/${p.id}`}
                >
                  {rialToToman(p.amount)} · مشاهدهٔ رسید
                </Link>
              </li>
            ))}
          </ul>
          {!data.payments.length && (
            <p className="page-description">
              پرداختی به نام شما در این واحد ثبت نشده است.
            </p>
          )}
        </Card>
        <Card>
          <h2 className="font-bold">اطلاعیه‌های مجاز شما</h2>
          <ul className="mt-4 space-y-3">
            {data.announcements.map((a) => (
              <li key={a.id}>
                <Link
                  className="text-primary underline"
                  href={`/announcements/${a.id}`}
                >
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
          <Link className="mt-4 block text-primary" href="/announcements">
            همهٔ اطلاعیه‌ها
          </Link>
        </Card>
      </div>
      <Card>
        <h2 className="font-bold">درخواست‌های من در این واحد</h2>
        <ul className="mt-4 space-y-3">
          {data.tickets.map((t) => (
            <li key={t.id}>
              <Link
                className="text-primary underline"
                href={`/requests/${t.id}`}
              >
                {digits(t.number)} · {t.title}
              </Link>
            </li>
          ))}
        </ul>
        <Link className="mt-4 block text-primary" href="/requests">
          ثبت و پیگیری درخواست‌ها
        </Link>
        <Link className="mt-3 block text-primary" href="/notifications">
          مرکز اعلان‌ها · {digits(data.unread)} خوانده‌نشده
        </Link>
      </Card>
    </div>
  );
}
