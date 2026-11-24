import { claimSmsDispatch } from "@/modules/sms/dispatch";
import { mappedVariables } from "@/modules/sms/events";
import { resolveNotificationSms } from "@/modules/sms/resolve-event";
import * as webpush from "web-push";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/security/core";
import { audit } from "@/modules/audit/service";
import { member, lock } from "./common";
import { categoryAllowed, defaultPreferences, type Category } from "./service";
import { decryptSubscription, pushConfiguration } from "@/modules/push/service";
import { notificationSmsProvider } from "@/modules/sms/service";
export type DeliveryResult = {
  status: "ACCEPTED" | "SIMULATED";
  providerMessageId: string | null;
};
export interface DeliveryTransport {
  send(input: {
    deliveryId: string;
    channel: string;
    userId: string;
    subscriptionId: string | null;
    notificationId: string;
    category: string;
  }): Promise<DeliveryResult>;
}
export const defaultTransport: DeliveryTransport = {
  async send(input) {
    if (input.channel === "SMS") {
      const recipient = await db.notification.findUniqueOrThrow({
        where: { id: input.notificationId },
        select: { userId: true, eventKey: true },
      });
      if (recipient.userId !== input.userId) throw new Error("INACTIVE");
      const user = await db.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { phone: true },
      });
      const event = await resolveNotificationSms(input.notificationId);
      if (!event) throw new Error("EVENT_SUPPRESSED");
      await db.smsDelivery.updateMany({
        where: { deliveryId: input.deliveryId, eventKey: null },
        data: { eventKey: event.event },
      });
      const template = await db.smsEventTemplate.findUnique({
        where: { eventKey: event.event },
      });
      if (!template?.enabled) throw new Error("PATTERN_DISABLED");
      mappedVariables(event.event, event.payload, template.variableMapping);
      await claimSmsDispatch(
        input.deliveryId,
        event.event,
        recipient.eventKey,
        input.userId,
      );
      return notificationSmsProvider().send({
        phone: user.phone,
        template: event.event,
        content: "پیام جدید در سامانه",
        event,
        idempotencyKey: input.deliveryId,
      });
    }
    const config = pushConfiguration();
    if (!config.enabled) throw new Error("UNCONFIGURED");
    const device = await db.pushSubscription.findUniqueOrThrow({
      where: { id: input.subscriptionId! },
    });
    if (
      device.revokedAt ||
      (device.expiresAt && device.expiresAt <= new Date())
    )
      throw new Error("EXPIRED");
    const subscription = decryptSubscription(device.encryptedSubscription);
    const response = await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: "ساختمان دلتا",
        body: "پیام جدیدی در سامانه دارید. برای مشاهده وارد شوید.",
        url: "/notifications",
        tag: "delta-" + input.notificationId,
      }),
      {
        TTL: 3600,
        timeout: 10000,
        topic: hashToken(input.deliveryId).slice(0, 32),
        vapidDetails: {
          subject: process.env.VAPID_SUBJECT!,
          publicKey: process.env.VAPID_PUBLIC_KEY!,
          privateKey: process.env.VAPID_PRIVATE_KEY!,
        },
      },
    );
    if (response.statusCode < 200 || response.statusCode >= 300)
      throw Object.assign(new Error("PROVIDER"), {
        statusCode: response.statusCode,
      });
    // The provider accepted the request; device display is not asserted.
    await db.pushSubscription
      .update({ where: { id: device.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    const acknowledgement =
      response.headers["apns-id"] || response.headers["x-message-id"];
    return {
      status: "ACCEPTED",
      providerMessageId:
        typeof acknowledgement === "string"
          ? acknowledgement.slice(0, 200)
          : null,
    };
  },
};
export async function processDelivery(
  id: string,
  transport: DeliveryTransport = defaultTransport,
  now = new Date(),
) {
  const claim = await db.$transaction(async (tx) => {
    await lock(tx, "delivery:" + id);
    const delivery = await tx.notificationDelivery.findUniqueOrThrow({
      where: { id },
      include: { notification: true },
    });
    if (
      delivery.channel === "INAPP" ||
      !["PENDING", "SENDING"].includes(delivery.status)
    )
      return null;
    if (delivery.status === "SENDING") {
      if (
        delivery.lockedAt &&
        delivery.lockedAt.getTime() < now.getTime() - 60000
      ) {
        // Outcome after a crashed network send is unknowable. Never blindly resend.
        await tx.notificationDelivery.update({
          where: { id },
          data: { status: "UNKNOWN", lastError: "UNKNOWN", lockedAt: null },
        });
        await tx.notificationDeliveryAttempt.updateMany({
          where: { deliveryId: id, status: "SENDING" },
          data: { status: "UNKNOWN", errorCode: "UNKNOWN", finishedAt: now },
        });
        await tx.smsDelivery.updateMany({
          where: { deliveryId: id },
          data: { status: "UNKNOWN" },
        });
        await audit("communication.delivery.unknown", null, id, {}, tx);
      }
      return null;
    }
    if (delivery.nextAttemptAt > now) return null;
    const n = await tx.notificationDelivery.update({
      where: { id },
      data: { status: "SENDING", attempts: { increment: 1 }, lockedAt: now },
    });
    const attempt = await tx.notificationDeliveryAttempt.create({
      data: {
        deliveryId: id,
        number: n.attempts,
        status: "SENDING",
        startedAt: now,
      },
    });
    await tx.smsDelivery.updateMany({
      where: { deliveryId: id },
      data: { status: "SENDING" },
    });
    return { ...n, notification: delivery.notification, attemptId: attempt.id };
  });
  if (!claim) return;
  let status = "FAILED",
    code: string | null = null,
    providerMessageId: string | null = null;
  try {
    const user = await db.user.findUniqueOrThrow({
      where: { id: claim.notification.userId },
      include: { roles: { include: { role: true } } },
    });
    try {
      await member(user);
    } catch {
      throw new Error("INACTIVE");
    }
    const preference =
      (await db.notificationPreference.findUnique({
        where: { userId: user.id },
      })) || defaultPreferences;
    if (
      !categoryAllowed(
        preference,
        claim.notification.category as Category,
        claim.notification.mandatory,
      ) ||
      !(claim.channel === "PUSH" ? preference.push : preference.sms)
    )
      throw new Error("PREFERENCE");
    const result = await transport.send({
      deliveryId: id,
      channel: claim.channel,
      userId: user.id,
      subscriptionId: claim.subscriptionId,
      notificationId: claim.notificationId,
      category: claim.notification.category,
    });
    status = result.status;
    providerMessageId = result.providerMessageId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "PROVIDER";
    const statusCode =
      error && typeof error === "object" && "statusCode" in error
        ? Number(error.statusCode)
        : 0;
    if (
      [
        "UNCONFIGURED",
        "SENDER_UNCONFIRMED",
        "SENDER_UNAVAILABLE",
        "PREFERENCE",
        "INACTIVE",
        "EXPIRED",
        "PATTERN_DISABLED",
        "EVENT_SUPPRESSED",
        "EVENT_DUPLICATE",
      ].includes(message)
    ) {
      status = "SKIPPED";
      code = message;
    } else if ([404, 410].includes(statusCode)) {
      status = "SKIPPED";
      code = "EXPIRED";
      if (claim.subscriptionId)
        await db.pushSubscription.update({
          where: { id: claim.subscriptionId },
          data: { revokedAt: now },
        });
    } else if (
      message === "TRANSIENT" ||
      statusCode === 429 ||
      statusCode >= 500
    ) {
      status = claim.attempts < 5 ? "PENDING" : "FAILED";
      code = claim.attempts < 5 ? "TRANSIENT" : "RETRY_LIMIT";
    } else if (
      ["ETIMEDOUT", "ECONNRESET", "UNKNOWN"].some((part) =>
        message.includes(part),
      )
    ) {
      status = "UNKNOWN";
      code = "UNKNOWN";
    } else {
      status = "FAILED";
      code = message.startsWith("SMS_MAPPING_INVALID")
        ? "MAPPING_INVALID"
        : message.startsWith("SMS_PAYLOAD_INVALID")
          ? "PAYLOAD_INVALID"
          : "PROVIDER_REJECTED";
    }
  }
  const retryAt = new Date(
    now.getTime() + Math.min(3600000, 30000 * 2 ** (claim.attempts - 1)),
  );
  await db.$transaction(async (tx) => {
    await lock(tx, "delivery:" + id);
    const current = await tx.notificationDelivery.findUniqueOrThrow({
      where: { id },
    });
    if (current.status !== "SENDING" || current.attempts !== claim.attempts)
      return;
    await tx.notificationDelivery.update({
      where: { id },
      data: {
        status,
        lastError: code,
        providerMessageId,
        lockedAt: null,
        nextAttemptAt: retryAt,
      },
    });
    await tx.notificationDeliveryAttempt.update({
      where: { id: claim.attemptId },
      data: {
        status: status === "PENDING" ? "RETRY" : status,
        errorCode: code,
        providerMessageId,
        finishedAt: new Date(Math.max(Date.now(), now.getTime())),
      },
    });
    await tx.smsDelivery.updateMany({
      where: { deliveryId: id },
      data: { status, providerMessageId },
    });
    await audit(
      "communication.delivery." + status.toLowerCase(),
      null,
      id,
      { channel: claim.channel, attempt: claim.attempts, code },
      tx,
    );
    if (status === "PENDING")
      await tx.outboxJob.updateMany({
        where: { key: "delivery:" + id },
        data: { status: "PENDING", availableAt: retryAt, lockedAt: null },
      });
  });
  return status;
}
