import { ActionForm } from "@/components/shared/action-form";
import { Input } from "@/components/ui/input";
export function UnitContactForm({
  unitId,
  kind,
  contact,
}: {
  unitId: string;
  kind: "OWNER" | "TENANT";
  contact?: { name: string; phone: string | null };
}) {
  const label = kind === "OWNER" ? "مالک" : "مستأجر";
  return (
    <ActionForm label={`ذخیرهٔ اطلاعات ${label}`}>
      <input type="hidden" name="operation" value="unit-contact" />
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="kind" value={kind} />
      <label className="field">
        نام و نام خانوادگی {label}
        <Input
          name="name"
          defaultValue={contact?.name || ""}
          required
          minLength={3}
          maxLength={100}
        />
      </label>
      <label className="field">
        شماره همراه {label} (اختیاری)
        <Input
          name="phone"
          defaultValue={contact?.phone || ""}
          type="tel"
          dir="ltr"
          maxLength={40}
        />
      </label>
      <p className="text-xs leading-6 text-secondary">
        شماره را می‌توانید بعداً اضافه کنید. با شمارهٔ ثبت‌شده، همان حساب در اولین
        ورود استفاده می‌شود؛ ورود قبلی لازم نیست.
      </p>
      <label className="flex items-start gap-3 text-sm leading-7">
        <input type="checkbox" name="approveAccess" defaultChecked className="mt-2" />
        فعال‌کردن ورود این عضو با شمارهٔ ثبت‌شده (بدون ثبت‌نام و تأیید دوباره)
      </label>
    </ActionForm>
  );
}
