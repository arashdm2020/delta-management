"use server";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/modules/auth/session";
import { assertOrigin } from "@/modules/auth/http";
import { refreshSenderLines } from "./sender-settings";
import { SenderDiscoveryError } from "./lines";
import type { SmsActionResult, SenderPublicView } from "./sender-view";
import { DomainError } from "@/lib/security/core";
import { saveSmsSettings, smsSettingsView } from "./settings";
import { saveEventTemplate, saveReminderPolicy } from "./template-service";
import { smsEvents, type SmsEventKey, requiredVariables } from "./events";
export async function smsSettingsAction(
  _previous: SmsActionResult,
  form: FormData,
): Promise<SmsActionResult> {
  const actor = await requireSuperAdmin();
  await assertOrigin();
  const value = (key: string) => String(form.get(key) || "").trim();
  const providerView = async (): Promise<SenderPublicView> => {
    const v = await smsSettingsView(actor);
    return {
      enabled: v.enabled,
      hasApiKey: v.hasApiKey,
      fromNumber: v.fromNumber,
      lines: v.lines,
      source: v.source,
      patternConfirmed: v.patternConfirmed,
      revision: v.revision,
      checkedAt: v.checkedAt,
      legacyConfigured: Object.keys(v.patterns).length > 0,
    };
  };
  try {
    if (
      value("operation") === "discover" ||
      (value("operation") === "provider" &&
        value("apiKey") &&
        !form.has("manual") &&
        !form.has("clearApiKey"))
    ) {
      const count = await refreshSenderLines(
        actor,
        value("apiKey"),
        value("expectedRevision"),
      );
      revalidatePath("/management/sms");
      return {
        ok: count > 0,
        message:
          count === 0
            ? "هیچ خط قابل استفاده‌ای برنگشت؛ مجوز خطوط اشتراکی یا خدماتی را در پنل بررسی کنید یا با تأیید مجوز، روش دستی را به‌کار ببرید."
            : count === 1
              ? "یک خط به‌عنوان گزینه انتخاب شد؛ مجوز ارسال پترن آن را در پنل تأیید و ذخیره کنید."
              : "خطوط دریافت شد؛ یک خط را انتخاب و مجوز پترن آن را تأیید کنید.",
        provider: await providerView(),
      };
    }
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
          fromNumber: form.has("manual")
            ? value("manualNumber")
            : value("fromNumber"),
          manual: form.has("manual"),
          patternConfirmed: form.has("patternConfirmed"),
          expectedRevision: value("expectedRevision"),
        });
    }
    revalidatePath("/management/sms");
    return {
      ...(value("operation") === "provider"
        ? { provider: await providerView() }
        : {}),
      ok: true,
      message: "تنظیمات ذخیره شد؛ ذخیرهٔ تنظیمات پیامک ارسال نمی‌کند.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof SenderDiscoveryError
          ? `${error.code}: ${error.message}`
          : error instanceof DomainError
            ? error.message
            : error instanceof Error &&
                error.message.startsWith("SMS_MAPPING_INVALID")
              ? error.message
              : "تنظیمات معتبر نیست؛ کد پترن، نگاشت و مقادیر زمان‌بندی را بررسی کنید.",
    };
  }
}
