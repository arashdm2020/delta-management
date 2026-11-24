import { Shell } from "@/components/layout/shell";
import Link from "next/link";
import { requireUser } from "@/modules/auth/session";
import { ActionForm } from "@/components/shared/action-form";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export default async function Profile() {
  const user = await requireUser();
  const content = (
    <div className="mx-auto max-w-xl space-y-6 px-5 py-10">
      <div>
        <h1 className="page-heading">پروفایل من</h1>
        <p className="page-description">
          شمارهٔ همراه تأییدشده فقط برای شما و مدیریت قابل مشاهده است.
        </p>
      </div>
      <Card>
        <p className="mb-5 text-sm text-secondary" dir="ltr">
          {user.phone}
        </p>
        <ActionForm profile>
          <label className="field">
            نام و نام خانوادگی
            <Input
              name="name"
              defaultValue={user.name || ""}
              required
              minLength={3}
              maxLength={100}
            />
          </label>
        </ActionForm>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/home">خانه</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/settings">تنظیمات</Link>
        </Button>
        <form action={logout}>
          <Button variant="ghost">خروج از حساب</Button>
        </form>
      </div>
    </div>
  );
  return user.status === "APPROVED" ? (
    <Shell user={user}>{content}</Shell>
  ) : (
    <main>{content}</main>
  );
}
