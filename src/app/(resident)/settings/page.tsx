import { requireApproved } from "@/modules/auth/session";
import { hasRole } from "@/lib/security/core";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { InstallGuide } from "@/components/shared/pwa";
import { revokeSessions } from "@/app/actions";
import { Button } from "@/components/ui/button";
export default async function Settings() {
  const actor = await requireApproved();
  return (
    <div className="space-y-6">
      <h1 className="page-heading">تنظیمات برنامه</h1>
      <Link
        className="nav-extra bg-white text-primary"
        href="/settings/notifications"
      >
        تنظیمات اعلان‌ها و دستگاه‌ها
      </Link>
      {hasRole(actor, "SUPER_ADMIN") && (
        <Link
          className="nav-extra bg-white text-primary"
          href="/management/sms"
        >
          تنظیمات فراز پیامک و پترن‌ها
        </Link>
      )}
      <Card id="install">
        <h2 className="mb-4 font-bold">نصب و استفاده از برنامه</h2>
        <InstallGuide />
      </Card>
      <Card>
        <h2 className="mb-2 font-bold">امنیت حساب</h2>
        <p className="page-description mb-5">
          با خروج از همهٔ دستگاه‌ها، تمام نشست‌های فعال لغو می‌شوند.
        </p>
        <form action={revokeSessions}>
          <Button variant="destructive">خروج از همهٔ دستگاه‌ها</Button>
        </form>
      </Card>
    </div>
  );
}
