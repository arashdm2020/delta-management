import { acceptsDevelopmentOtp } from "./development-otp";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/modules/audit/service";
import { smsProvider } from "./sms";
import { normalizePhone } from "@/lib/validation";
import {
  DomainError,
  equalHash,
  hashToken,
  otpHash,
  otpValid,
  randomOtp,
  randomToken,
} from "@/lib/security/core";
export async function requestOtp(
  rawPhone: string,
  origin: string,
  send = smsProvider.send.bind(smsProvider),
) {
  const phone = normalizePhone(rawPhone);
  const code = randomOtp();
  const id = randomUUID();
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${phone}))`;
    for (const [key, limit] of [
      ["phone:" + phone, 5],
      ["origin:" + origin, 20],
    ] as const) {
      const bucket = hashToken(key + ":" + Math.floor(now.getTime() / 3600000));
      const rate = await tx.securityRateLimit.upsert({
        where: { key: bucket },
        create: { key: bucket },
        update: { count: { increment: 1 } },
      });
      if (rate.count > limit)
        throw new DomainError(
          "RATE",
          "تعداد درخواست‌ها زیاد است؛ بعداً تلاش کنید.",
        );
    }
    const previous = await tx.oTPChallenge.findFirst({
      where: { phone },
      orderBy: { createdAt: "desc" },
    });
    if (previous && now.getTime() - previous.createdAt.getTime() < 60000)
      throw new DomainError("COOLDOWN", "برای ارسال دوباره یک دقیقه صبر کنید.");
    await tx.oTPChallenge.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.oTPChallenge.create({
      data: {
        id,
        phone,
        codeHash: otpHash(id, code),
        expiresAt: new Date(now.getTime() + 300000),
      },
    });
    await audit(
      "auth.otp.request",
      null,
      undefined,
      { phoneHash: hashToken(phone) },
      tx,
    );
  });
  try {
    await send(phone, code);
  } catch {
    await db.oTPChallenge.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
    throw new DomainError("SMS", "ارسال پیامک در دسترس نیست.");
  }
  return { challengeId: id };
}
export async function verifyOtp(id: string, code: string, origin: string) {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    const bucket = hashToken(
      "verify:" + origin + ":" + Math.floor(Date.now() / 3600000),
    );
    const rate = await tx.securityRateLimit.upsert({
      where: { key: bucket },
      create: { key: bucket },
      update: { count: { increment: 1 } },
    });
    if (rate.count > 100) return null;
    const challenge = await tx.oTPChallenge.findUnique({ where: { id } });
    if (!challenge || !otpValid(challenge)) return null;
    await tx.oTPChallenge.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
    if (!acceptsDevelopmentOtp(code) && !equalHash(challenge.codeHash, otpHash(id, code))) {
      await audit("auth.otp.failed", null, id, {}, tx);
      return null;
    }
    await tx.oTPChallenge.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
    const user = await tx.user.upsert({
      where: { phone: challenge.phone },
      create: { phone: challenge.phone },
      update: {},
    });
    if (user.status === "SUSPENDED") return null;
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    await tx.session.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
    });
    await audit("auth.login", user.id, user.id, {}, tx);
    return { token, expiresAt, user };
  });
  if (!result) throw new DomainError("OTP", "کد نامعتبر یا منقضی است.");
  return result;
}
