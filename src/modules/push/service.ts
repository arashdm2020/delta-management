import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { type Actor, secret, hashToken, fail } from "@/lib/security/core";
import { member, rateLimit, lock } from "@/modules/notifications/common";
import { audit } from "@/modules/audit/service";
const endpoint = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      [
        "fcm.googleapis.com",
        "push.services.mozilla.com",
        "web.push.apple.com",
        "wns.windows.com",
      ].some(
        (host) => url.hostname === host || url.hostname.endsWith("." + host),
      )
    );
  }, "نشانی سرویس Push معتبر نیست.");
export const subscriptionSchema = z.object({
  endpoint,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87,88}={0,2}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22,24}={0,2}$/),
  }),
});
export type Subscription = z.infer<typeof subscriptionSchema>;
function encryptionKey() {
  return createHash("sha256")
    .update("delta-push:" + secret())
    .digest();
}
function encrypt(value: Subscription) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  );
}
export function decryptSubscription(value: string): Subscription {
  const bytes = Buffer.from(value, "base64url");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    bytes.subarray(0, 12),
  );
  cipher.setAuthTag(bytes.subarray(12, 28));
  return subscriptionSchema.parse(
    JSON.parse(
      Buffer.concat([
        cipher.update(bytes.subarray(28)),
        cipher.final(),
      ]).toString("utf8"),
    ),
  );
}
export function pushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY,
    privateKey = process.env.VAPID_PRIVATE_KEY,
    subject = process.env.VAPID_SUBJECT;
  return {
    enabled: Boolean(
      publicKey &&
        privateKey &&
        subject &&
        /^(mailto:|https:\/\/)/.test(subject),
    ),
    publicKey: publicKey || "",
  };
}
export async function registerSubscription(
  actor: Actor,
  input: unknown,
  deviceName: string,
) {
  await member(actor);
  const subscription = subscriptionSchema.parse(input);
  const name = z.string().trim().min(2).max(100).parse(deviceName);
  if (subscription.expirationTime && subscription.expirationTime <= Date.now())
    fail("اشتراک منقضی شده است.");
  const endpointHash = hashToken(subscription.endpoint);
  return db.$transaction(async (tx) => {
    await rateLimit(tx, actor.id, "push-register", 20);
    await lock(tx, "push-user:" + actor.id);
    await lock(tx, "push:" + endpointHash);
    const previous = await tx.pushSubscription.findUnique({
      where: { endpointHash },
    });
    if (previous && previous.userId !== actor.id)
      return fail(
        "این دستگاه به حساب دیگری متصل است؛ ابتدا از همان حساب لغو کنید.",
      );
    if (
      !previous &&
      (await tx.pushSubscription.count({
        where: { userId: actor.id, revokedAt: null },
      })) >= 10
    )
      fail("حداکثر ده دستگاه فعال مجاز است.");
    const record = await tx.pushSubscription.upsert({
      where: { endpointHash },
      create: {
        userId: actor.id,
        endpointHash,
        encryptedSubscription: encrypt(subscription),
        deviceName: name,
        expiresAt: subscription.expirationTime
          ? new Date(subscription.expirationTime)
          : null,
      },
      update: {
        encryptedSubscription: encrypt(subscription),
        deviceName: name,
        expiresAt: subscription.expirationTime
          ? new Date(subscription.expirationTime)
          : null,
        revokedAt: null,
      },
    });
    await audit("communication.push.register", actor.id, record.id, {}, tx);
    return { id: record.id, deviceName: record.deviceName };
  });
}
export async function devices(actor: Actor) {
  await member(actor);
  return db.pushSubscription.findMany({
    where: { userId: actor.id },
    select: {
      id: true,
      deviceName: true,
      createdAt: true,
      revokedAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
export async function revokeSubscription(actor: Actor, id: string) {
  await member(actor);
  z.uuid().parse(id);
  return db.$transaction(async (tx) => {
    const result = await tx.pushSubscription.updateMany({
      where: { id, userId: actor.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) fail("دستگاه فعال در دسترس نیست.");
    await audit("communication.push.revoke", actor.id, id, {}, tx);
  });
}
export async function expireSubscriptions(now = new Date()) {
  return db.pushSubscription.updateMany({
    where: { revokedAt: null, expiresAt: { lte: now } },
    data: { revokedAt: now },
  });
}
