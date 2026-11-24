import Link from "next/link";
import { redirect } from "next/navigation";
import { canManage } from "@/lib/security/core";
import { Clock3 } from "lucide-react";
import { requireUser } from "@/modules/auth/session";
import { logout } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export default async function Pending() {
  const user = await requireUser();
  if (user.name && canManage(user)) redirect("/home");
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-5 p-5">
      <Card>
        <Clock3 className="mb-5 text-primary" size={36} />
        <h1 className="page-heading">در انتظار تأیید مدیریت</h1>
        <p className="page-description">
          سلام {user.name || "همراه گرامی"}. پس از تکمیل مشخصات، مدیریت باید
          حساب شما را تأیید و به واحد مرتبط متصل کند. تا آن زمان اطلاعات خصوصی
          ساختمان در دسترس نیست.
        </p>
        <div className="mt-6 grid gap-3">
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
