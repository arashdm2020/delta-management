import { z } from "zod";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { db } from "@/lib/db";
import { type Actor, hasRole, fail, secret } from "@/lib/security/core";
import { audit } from "@/modules/audit/service";
export const smsCategories = [
  "OTP",
  "general",
  "financial",
  "meetings",
  "tickets",
  "operational",
  "security",
] as const;
export const patternSchema = z.object({
  code: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  variable: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/),
});
export const patternsSchema = z.partialRecord(
  z.enum(smsCategories),
  patternSchema,
);
function key() {
  return createHash("sha256")
    .update("delta-sms:" + secret())
    .digest();
}
export function encryptSmsKey(value: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function decryptSmsKey(value: string) {
  const bytes = Buffer.from(value, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    cipher.update(bytes.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
export function senderCredentialHash(apiKey: string) {
  return createHash("sha256")
    .update("delta-sender:" + secret() + ":" + apiKey)
    .digest("hex");
}
export function providerKey(
  setting: { encryptedApiKey: string | null } | null,
) {
  return setting?.encryptedApiKey
    ? decryptSmsKey(setting.encryptedApiKey)
    : process.env.FARAZSMS_API_KEY?.trim() || "";
}
export async function saveSmsSettings(actor: Actor, input: unknown) {
  if (!hasRole(actor, "SUPER_ADMIN"))
    fail("فقط مدیر کل می‌تواند تنظیمات پیامک را تغییر دهد.");
  const data = z
    .object({
      enabled: z.boolean(),
      apiKey: z.string().trim().max(1000),
      clearApiKey: z.boolean(),
      fromNumber: z.string().trim().max(20),
      manual: z.boolean().default(false),
      patternConfirmed: z.boolean().default(false),
      expectedRevision: z.string().optional(),
      patterns: patternsSchema.optional(),
    })
    .parse(input);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sms-settings'))`;
    const previous = await tx.smsProviderSetting.findUnique({
      where: { key: "farazsms" },
    });
    if (
      data.expectedRevision !== undefined &&
      data.expectedRevision !== (previous?.updatedAt.toISOString() || "")
    )
      fail("تنظیمات هم‌زمان تغییر کرده است؛ صفحه را تازه کنید.");
    const apiKey = data.clearApiKey ? "" : data.apiKey || providerKey(previous);
    const changed = Boolean(
      data.apiKey &&
      (!previous?.encryptedApiKey || apiKey !== providerKey(previous)),
    );
    const encryptedApiKey = data.clearApiKey
      ? null
      : data.apiKey
        ? encryptSmsKey(apiKey)
        : previous?.encryptedApiKey || (apiKey ? encryptSmsKey(apiKey) : null);
    let fromNumber = data.clearApiKey ? "" : data.fromNumber;
    const hash = apiKey ? senderCredentialHash(apiKey) : null;
    const lines = z.array(z.string()).parse(previous?.senderLines || []);
    const discovered =
      !changed &&
      previous?.senderKeyHash === hash &&
      lines.includes(fromNumber);
    if (fromNumber && !/^[0-9]{3,20}$/.test(fromNumber))
      fail("شمارهٔ خط باید فقط رقم انگلیسی و مطابق پنل سرویس باشد.");
    if (fromNumber && !data.manual && !discovered)
      fail(
        "خط انتخاب‌شده برای این کلید تأیید نشده؛ ابتدا دریافت خطوط را بزنید یا روش دستی را صریح انتخاب کنید.",
      );
    if (
      (data.enabled || data.manual) &&
      (!apiKey || !fromNumber || !data.patternConfirmed)
    )
      fail(
        "کلید، خط ارسال و تأیید صریح مجوز ارسال پترن لازم است. دسترسی به خط به معنی مجاز بودن پترن نیست.",
      );
    if (data.clearApiKey && data.enabled)
      fail("پیش از حذف کلید، ارسال واقعی را غیرفعال کنید.");
    const source = fromNumber ? (data.manual ? "MANUAL" : "DISCOVERED") : null;
    if (data.clearApiKey) fromNumber = "";
    const fields = {
      enabled: data.enabled,
      encryptedApiKey,
      fromNumber,
      patterns: data.patterns || previous?.patterns || {},
      updatedById: actor.id,
      senderSource: source,
      senderPatternConfirmed: data.patternConfirmed && Boolean(fromNumber),
      senderKeyHash: fromNumber ? hash : null,
      senderCheckedAt: fromNumber ? new Date() : null,
      senderLines: data.clearApiKey || changed ? [] : lines,
    };
    await tx.smsProviderSetting.upsert({
      where: { key: "farazsms" },
      create: { key: "farazsms", ...fields },
      update: fields,
    });
    if (data.patterns?.OTP)
      await tx.smsEventTemplate.update({
        where: { eventKey: "auth.otp" },
        data: {
          providerCode: data.patterns.OTP.code,
          variableMapping: { code: data.patterns.OTP.variable },
          enabled: data.enabled,
          updatedById: actor.id,
        },
      });
    await audit(
      "sms.settings.save",
      actor.id,
      undefined,
      {
        enabled: data.enabled,
        keyChanged: changed || data.clearApiKey,
        senderSource: source,
        patternConfirmed: fields.senderPatternConfirmed,
      },
      tx,
    );
  });
}
export async function smsSettingsView(actor: Actor) {
  if (!hasRole(actor, "SUPER_ADMIN")) fail("دسترسی مجاز نیست.");
  const setting = await db.smsProviderSetting.findUnique({
    where: { key: "farazsms" },
  });
  const apiKey = providerKey(setting);
  const bound = Boolean(
    apiKey && setting?.senderKeyHash === senderCredentialHash(apiKey),
  );
  return {
    enabled: setting?.enabled || false,
    hasApiKey: Boolean(apiKey),
    fromNumber: setting?.fromNumber || "",
    patterns: patternsSchema.parse(setting?.patterns || {}),
    lines: bound ? z.array(z.string()).parse(setting?.senderLines || []) : [],
    source: setting?.senderSource || "LEGACY",
    patternConfirmed: bound && Boolean(setting?.senderPatternConfirmed),
    revision: setting?.updatedAt.toISOString() || "",
    checkedAt: setting?.senderCheckedAt?.toISOString() || null,
  };
}
export type SenderSettingsView = Awaited<ReturnType<typeof smsSettingsView>>;
