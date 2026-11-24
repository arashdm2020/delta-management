import { db } from "@/lib/db";
import { hasRole, fail, type Actor } from "@/lib/security/core";
import { audit } from "@/modules/audit/service";
import { discoverAccessibleLines, selectDiscoveredSender } from "./lines";
import { encryptSmsKey, providerKey, senderCredentialHash } from "./settings";
export async function refreshSenderLines(
  actor: Actor,
  newApiKey = "",
  expectedRevision?: string,
  transport: typeof fetch = fetch,
) {
  if (!hasRole(actor, "SUPER_ADMIN")) fail("دسترسی مدیر کل لازم است.");
  if (newApiKey.length > 1000) fail("کلید معتبر نیست.");
  const before = await db.smsProviderSetting.findUnique({
    where: { key: "farazsms" },
  });
  if (
    expectedRevision !== undefined &&
    expectedRevision !== (before?.updatedAt.toISOString() || "")
  )
    fail("تنظیمات تغییر کرده؛ صفحه را تازه کنید.");
  const apiKey = newApiKey.trim() || providerKey(before);
  const lines = await discoverAccessibleLines(apiKey, transport);
  const changed = !before?.encryptedApiKey || providerKey(before) !== apiKey;
  const selected = selectDiscoveredSender(
    lines,
    before?.fromNumber || "",
    changed,
  );
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sms-settings'))`;
    const current = await tx.smsProviderSetting.findUnique({
      where: { key: "farazsms" },
    });
    if (
      (current?.updatedAt.toISOString() || "") !==
      (before?.updatedAt.toISOString() || "")
    )
      fail("پاسخ دریافت خطوط قدیمی شده است؛ دوباره تازه‌سازی کنید.");
    const confirmed =
      !changed &&
      selected === before?.fromNumber &&
      before.senderPatternConfirmed;
    const fields = {
      encryptedApiKey: changed
        ? encryptSmsKey(apiKey)
        : before!.encryptedApiKey,
      fromNumber: selected,
      senderSource: "DISCOVERED",
      senderLines: lines,
      senderKeyHash: senderCredentialHash(apiKey),
      senderCheckedAt: new Date(),
      senderPatternConfirmed: Boolean(confirmed),
      enabled: Boolean(before?.enabled && confirmed),
      updatedById: actor.id,
    };
    await tx.smsProviderSetting.upsert({
      where: { key: "farazsms" },
      create: { key: "farazsms", patterns: {}, ...fields },
      update: fields,
    });
    await audit(
      "sms.senders.refresh",
      actor.id,
      undefined,
      {
        count: lines.length,
        keyChanged: changed,
        previousSelectionAvailable: lines.includes(before?.fromNumber || ""),
        authorizationConfirmed: Boolean(confirmed),
      },
      tx,
    );
    return lines.length;
  });
}
