import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { type Actor, fail, hashToken } from "@/lib/security/core";
import { audit } from "@/modules/audit/service";
import { member, rateLimit, lock, pageNumber } from "./common";
import { z } from "zod";
export const defaultPreferences = {
  general: true,
  financial: true,
  meetings: true,
  tickets: true,
  push: false,
  sms: false,
};
export type Category =
  | "general"
  | "financial"
  | "meetings"
  | "tickets"
  | "operational"
  | "security";
export function categoryAllowed(
  preference: typeof defaultPreferences,
  category: Category,
  mandatory = false,
) {
  return (
    mandatory ||
    category === "operational" ||
    category === "security" ||
    preference[category]
  );
}
export async function preferences(actor: Actor) {
  await member(actor);
  return (
    (await db.notificationPreference.findUnique({
      where: { userId: actor.id },
    })) || { userId: actor.id, ...defaultPreferences }
  );
}
export async function savePreferences(
  actor: Actor,
  input: typeof defaultPreferences,
) {
  await member(actor);
  const data = z
    .object({
      general: z.boolean(),
      financial: z.boolean(),
      meetings: z.boolean(),
      tickets: z.boolean(),
      push: z.boolean(),
      sms: z.boolean(),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    await rateLimit(tx, actor.id, "preferences");
    const record = await tx.notificationPreference.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, ...data },
      update: data,
    });
    await audit("communication.preferences", actor.id, actor.id, {}, tx);
    return record;
  });
}
export async function emitNotification(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    eventKey: string;
    category: Category;
    title: string;
    body: string;
    href: string;
    mandatory?: boolean;
  },
) {
  const preference =
    (await tx.notificationPreference.findUnique({
      where: { userId: input.userId },
    })) || defaultPreferences;
  if (!categoryAllowed(preference, input.category, input.mandatory))
    return null;
  const user = await tx.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { status: true, phone: true },
  });
  if (user.status !== "APPROVED") return null;
  await lock(tx, "notification:" + input.userId + ":" + input.eventKey);
  const existing = await tx.notification.findUnique({
    where: {
      userId_eventKey: { userId: input.userId, eventKey: input.eventKey },
    },
  });
  if (existing) return existing;
  const notification = await tx.notification.upsert({
    where: {
      userId_eventKey: { userId: input.userId, eventKey: input.eventKey },
    },
    create: input,
    update: {},
  });
  await tx.notificationDelivery.upsert({
    where: {
      notificationId_channel_targetKey: {
        notificationId: notification.id,
        channel: "INAPP",
        targetKey: input.userId,
      },
    },
    create: {
      notificationId: notification.id,
      channel: "INAPP",
      targetKey: input.userId,
      status: "DELIVERED",
    },
    update: {},
  });
  const devices = preference.push
    ? await tx.pushSubscription.findMany({
        where: {
          userId: input.userId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      })
    : [];
  for (const device of devices) await delivery("PUSH", device.id, device.id);
  if (preference.sms) await delivery("SMS", input.userId);
  async function delivery(
    channel: "PUSH" | "SMS",
    targetKey: string,
    subscriptionId?: string,
  ) {
    const row = await tx.notificationDelivery.upsert({
      where: {
        notificationId_channel_targetKey: {
          notificationId: notification.id,
          channel,
          targetKey,
        },
      },
      create: {
        notificationId: notification.id,
        channel,
        targetKey,
        subscriptionId,
      },
      update: {},
    });
    if (channel === "SMS")
      await tx.smsDelivery.upsert({
        where: { deliveryId: row.id },
        create: {
          deliveryId: row.id,
          templateKey: input.category,
          phoneHash: hashToken(user.phone),
        },
        update: {},
      });
    await tx.outboxJob.upsert({
      where: { key: "delivery:" + row.id },
      create: {
        key: "delivery:" + row.id,
        kind: "COMM_DELIVERY",
        payload: { deliveryId: row.id },
      },
      update: {},
    });
  }
  await audit(
    "communication.notification.create",
    null,
    notification.id,
    { category: input.category },
    tx,
  );
  return notification;
}
export async function notificationList(actor: Actor, rawPage = 1) {
  await member(actor);
  const page = pageNumber(rawPage);
  const [rows, total, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: actor.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
      select: {
        id: true,
        title: true,
        body: true,
        href: true,
        category: true,
        mandatory: true,
        readAt: true,
        createdAt: true,
      },
    }),
    db.notification.count({ where: { userId: actor.id } }),
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
  ]);
  return { rows, total, unread, page };
}
export async function unreadCount(actor: Actor) {
  if (actor.status !== "APPROVED") return 0;
  return db.notification.count({ where: { userId: actor.id, readAt: null } });
}
export async function markNotification(actor: Actor, id: string, read = true) {
  await member(actor);
  z.uuid().parse(id);
  const result = await db.notification.updateMany({
    where: { id, userId: actor.id },
    data: { readAt: read ? new Date() : null },
  });
  if (!result.count) fail("اعلان در دسترس نیست.");
}
export async function markAllNotifications(actor: Actor) {
  await member(actor);
  await db.notification.updateMany({
    where: { userId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
}
export async function queueEvent(
  tx: Prisma.TransactionClient,
  key: string,
  kind: string,
  payload: Prisma.InputJsonValue,
  availableAt = new Date(),
) {
  return tx.outboxJob.upsert({
    where: { key },
    create: { key, kind, payload, availableAt },
    update: {},
  });
}
