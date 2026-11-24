"use server";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/modules/auth/session";
import { assertOrigin } from "@/modules/auth/http";
import { DomainError } from "@/lib/security/core";
import { saveSmsSettings } from "./settings";
import { saveEventTemplate, saveReminderPolicy } from "./template-service";
import { smsEvents, type SmsEventKey, requiredVariables } from "./events";
export async function smsSettingsAction(
  _previous: { ok: boolean; message: string },
  form: FormData,
) {
  const actor = await requireSuperAdmin();
  await assertOrigin();
  const value = (key: string) => String(form.get(key) || "").trim();
  try {
    switch (value("operation")) {
      case "template": {
        const event = value("eventKey") as SmsEventKey;
        if (!Object.hasOwn(smsEvents, event))
          throw new Error("SMS_MAPPING_INVALID: رویداد معتبر نیست.");
        const variableMapping = Object.fromEntries(
          requiredVariables(event).map((key) => [key, value(`mapping.${key}`)]),
        );
        await saveEventTemplate(actor, {
          eventKey: event,
          providerCode: value("providerCode"),
          enabled: form.has("enabled"),
          variableMapping,
          description: value("description"),
        });
        break;
      }
      case "schedule":
        await saveReminderPolicy(actor, {
          beforeDueDays: Number(value("beforeDueDays")),
          overdueDays: Number(value("overdueDays")),
          followupDays: form.has("followupEnabled")
            ? Number(value("followupDays"))
            : null,
          meetingHours: Number(value("meetingHours")),
        });
        break;
      default:
        await saveSmsSettings(actor, {
          enabled: form.has("enabled"),
          apiKey: value("apiKey"),
          clearApiKey: form.has("clearApiKey"),
          fromNumber: value("fromNumber"),
        });
    }
    revalidatePath("/management/sms");
    return {
      ok: true,
      message: "تنظیمات ذخیره شد؛ ذخیرهٔ تنظیمات پیامک ارسال نمی‌کند.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof DomainError
          ? error.message
          : error instanceof Error &&
              error.message.startsWith("SMS_MAPPING_INVALID")
            ? error.message
            : "تنظیمات معتبر نیست؛ کد پترن، نگاشت و مقادیر زمان‌بندی را بررسی کنید.",
    };
  }
}
