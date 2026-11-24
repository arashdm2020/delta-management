import { acceptsDevelopmentOtp } from "./development-otp";
import { temporaryLoginWindow, temporaryOtpExpiry } from "./temporary-login";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/modules/audit/service";
import { smsProvider } from "./sms";
import { smsFailureDiagnostic } from "@/modules/sms/errors";
import { normalizePhone } from "@/lib/validation";
import {
  DomainError,
  equalHash,
  hashToken,
  otpHash,
  otpValid,
  randomOtp,
  randomToken,
  canManage,
} from "@/lib/security/core";
function membersOnlyLogin() {
  return process.env.MEMBERS_ONLY_LOGIN === "true";
}
async function eligibleMember(tx: Prisma.TransactionClient, phone: string, now: Date) {
  const user = await tx.user.findUnique({
    where: { phone },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "APPROVED" || !user.name) return false;
  if (canManage(user)) return true;
  return Boolean(await tx.unitMembership.findFirst({
    where: { userId: user.id, startsAt: { lte: now }, endsAt: null, unit: { active: true } },
  }));
}
export async function requestOtp(
  rawPhone: string,
  origin: string,
  send = smsProvider.send.bind(smsProvider),
) {
  const phone = normalizePhone(rawPhone);
  const code = randomOtp();
  const id = randomUUID();
  const now = new Date();
  const temporaryWindow = temporaryLoginWindow(phone, now);
  const allowed = await db.$transaction(async (tx) => {
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
    if (membersOnlyLogin() && !(await eligibleMember(tx, phone, now))) {
      await audit("auth.member.denied", null, undefined, { phoneHash: hashToken(phone) }, tx);
      return false;
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
      { phoneHash: hashToken(phone), temporary: Boolean(temporaryWindow) },
      tx,
    );
    return true;
  });
  if (!allowed) throw new DomainError("MEMBER", "ورود فقط برای اعضایی فعال است که مدیریت از قبل معرفی کرده است.");
  try {
    if (!temporaryWindow) await send(phone, code);
  } catch (error) {
    const diagnostic = smsFailureDiagnostic(error);
    console.error("auth.otp.send.failed", diagnostic);
    await db.$transaction(async (tx) => {
      // An uncertain provider response may follow an actual send. Keep the
      // original challenge usable without resending or claiming delivery.
      if (diagnostic.reason !== "UNKNOWN")
        await tx.oTPChallenge.update({ where: { id }, data: { consumedAt: new Date() } });
      await audit("auth.otp.send.failed", null, id, diagnostic, tx);
    });
    if (diagnostic.reason === "UNKNOWN")
      return { challengeId: id, deliveryStatus: "unknown" as const };
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
    if (membersOnlyLogin() && !(await eligibleMember(tx, challenge.phone, new Date()))) return null;
    const temporaryExpiry = temporaryOtpExpiry(challenge.phone, code, challenge.createdAt);
    if (!temporaryExpiry && !acceptsDevelopmentOtp(code) && !equalHash(challenge.codeHash, otpHash(id, code))) {
      await audit("auth.otp.failed", null, id, {}, tx);
      return null;
    }
    await tx.oTPChallenge.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
    const user = membersOnlyLogin()
      ? await tx.user.findUniqueOrThrow({ where: { phone: challenge.phone } })
      : await tx.user.upsert({
      where: { phone: challenge.phone },
      create: { phone: challenge.phone },
      update: {},
    });
    if (user.status === "SUSPENDED") return null;
    const token = randomToken();
    const expiresAt = temporaryExpiry || new Date(Date.now() + 7 * 86400000);
    await tx.session.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
    });
    await audit("auth.login", user.id, user.id, { temporary: Boolean(temporaryExpiry) }, tx);
    return { token, expiresAt, user };
  });
  if (!result) throw new DomainError("OTP", "کد نامعتبر یا منقضی است.");
  return result;
}
