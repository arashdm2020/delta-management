import Link from "next/link";
import { requireManager } from "@/modules/auth/session";
import { hasRole } from "@/lib/security/core";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { ActionForm } from "@/components/shared/action-form";
import { Input } from "@/components/ui/input";
export default async function Building() {
  const actor = await requireManager();
  const building = await db.building.findUniqueOrThrow({
    where: { key: "delta" },
  });
  return (
    <Card>
      {hasRole(actor, "SUPER_ADMIN") && (
        <Link className="nav-extra text-primary" href="/management/sms">
          تنظیمات فراز پیامک و پترن‌ها
        </Link>
      )}
      <h2 className="mb-4 text-lg font-bold">اطلاعات ساختمان دلتا</h2>
      <p className="page-description mb-6">اردبیل · ظرفیت ۳۰ واحد</p>
      {hasRole(actor, "SUPER_ADMIN") ? (
        <ActionForm>
          <input name="operation" type="hidden" value="building" />
          <label className="field">
            نام ساختمان
            <Input
              name="name"
              defaultValue={building.name}
              required
              maxLength={100}
            />
          </label>
          <label className="field">
            نشانی واقعی
            <Input
              name="address"
              defaultValue={building.address || ""}
              maxLength={500}
            />
          </label>
        </ActionForm>
      ) : (
        <p className="text-sm">
          {building.name} · {building.address || "نشانی هنوز ثبت نشده است."}
        </p>
      )}
    </Card>
  );
}
