import { requireSuperAdmin } from "@/modules/auth/session";
import { smsSettingsView } from "@/modules/sms/settings";
import { reminderPolicy } from "@/modules/sms/template-service";
import { SmsSettingsForm } from "@/modules/sms/settings-form";
import { db } from "@/lib/db";
export default async function SmsSettings() {
  const actor = await requireSuperAdmin();
  const [settings, templates, schedule] = await Promise.all([
    smsSettingsView(actor),
    db.smsEventTemplate.findMany({ orderBy: { eventKey: "asc" } }),
    reminderPolicy(),
  ]);
  const admins = await db.user.findMany({
    where: {
      id: {
        in: templates.flatMap((row) =>
          row.updatedById ? [row.updatedById] : [],
        ),
      },
    },
    select: { id: true, name: true },
  });
  return (
    <div className="min-w-0 space-y-6">
      <h2 className="page-heading">تنظیمات فراز پیامک</h2>
      <p className="page-description">
        پترن مستقل برای هر رویداد؛ متغیرهای معتبر، ارسال قابل پیگیری.
      </p>
      <SmsSettingsForm
        settings={{
          enabled: settings.enabled,
          hasApiKey: settings.hasApiKey,
          fromNumber: settings.fromNumber,
          legacyConfigured: Object.keys(settings.patterns).length > 0,
        }}
        templates={templates.map((row) => ({
          ...row,
          variableMapping: row.variableMapping as Record<string, string>,
          updatedAt: row.updatedAt.toISOString(),
          administrator:
            admins.find((admin) => admin.id === row.updatedById)?.name ||
            "مقدار اولیهٔ سامانه",
        }))}
        schedule={schedule}
      />
    </div>
  );
}
