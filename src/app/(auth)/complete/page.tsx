import Link from "next/link";
import { requireUser } from "@/modules/auth/session";
import { ActionForm } from "@/components/shared/action-form";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { redirect } from "next/navigation";
export default async function Complete() {
  const user = await requireUser();
  if (user.name) redirect("/pending");
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-5 p-5">
      <Card>
        <h1 className="page-heading">تکمیل ثبت‌نام</h1>
        <p className="page-description mb-6">
          برای شناسایی توسط مدیریت، نام واقعی خود را ثبت کنید.
        </p>
        <ActionForm profile>
          <label className="field">
            نام و نام خانوادگی
            <Input
              name="name"
              required
              minLength={3}
              maxLength={100}
              autoComplete="name"
            />
          </label>
        </ActionForm>
        <Link
          className="mt-5 block text-sm text-primary underline"
          href="/pending"
        >
          ادامه به وضعیت دسترسی
        </Link>
      </Card>
    </main>
  );
}
