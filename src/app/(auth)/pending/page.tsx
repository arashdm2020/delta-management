import Link from "next/link";
import { redirect } from "next/navigation";
import { canManage } from "@/lib/security/core";
import { Clock3 } from "lucide-react";
import { requireUser } from "@/modules/auth/session";
import { logout } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { pendingOverview } from "@/modules/dashboards/service";
export const dynamic = "force-dynamic";
export default async function Pending() {
  const user = await requireUser();
  const membersOnly = process.env.MEMBERS_ONLY_LOGIN === "true";
  const manager = canManage(user);
  const activeMember =
    !manager &&
    membersOnly &&
    user.status === "APPROVED" &&
    (await db.unitMembership.findFirst({
      where: {
        userId: user.id,
        startsAt: { lte: new Date() },
        endsAt: null,
        unit: { active: true },
      },
    }));
  if (user.name && (manager || activeMember)) redirect("/home");
  const requested = await pendingOverview(user);
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-5 p-5">
      <Card>
        <Clock3 className="mb-5 text-primary" size={36} />
        <h1 className="page-heading">
          {membersOnly ? "دسترسی عضو فعال نیست" : "در انتظار تأیید مدیریت"}
        </h1>
        <p className="page-description">
          {membersOnly ? (
            "شمارهٔ عضو، واحد مرتبط و فعال بودن دسترسی را در فهرست اعضای مدیریت بررسی کنید. ثبت‌نام عمومی وجود ندارد."
          ) : (
            <>
              سلام {user.name || "همراه گرامی"}. پس از تکمیل مشخصات، مدیریت باید
              حساب شما را تأیید و به واحد مرتبط متصل کند. تا آن زمان اطلاعات
              خصوصی ساختمان در دسترس نیست.
            </>
          )}
        </p>
        <div className="mt-6 grid gap-3">
          <p className="text-sm">
            وضعیت حساب:{" "}
            {user.status === "PENDING"
              ? "دسترسی فعال نشده"
              : "واحد فعال مرتبط لازم است"}
          </p>
          <p className="text-sm">
            واحد معرفی‌شده:{" "}
            {requested.length
              ? [...new Set(requested.map((m) => m.unit.number))].join("، ")
              : "هنوز واحدی برای این حساب معرفی نشده است"}
          </p>
          <Button asChild>
            <a href="/home">بررسی دوبارهٔ دسترسی</a>
          </Button>
          <Button variant="outline" asChild>
            <Link href={user.name ? "/profile" : "/complete"}>
              ویرایش مشخصات
            </Link>
          </Button>
          <form action={logout}>
            <Button className="w-full" variant="ghost">
              خروج از حساب
            </Button>
          </form>
        </div>
      </Card>
    </main>
  );
}
