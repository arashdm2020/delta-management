import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { type Actor, canManage, fail } from "@/lib/security/core";
import { audit } from "@/modules/audit/service";
import {
  communicationManager,
  member,
  rateLimit,
  lock,
  audienceUsers,
  pageNumber,
  type Audience,
} from "@/modules/notifications/common";
import { emitNotification, queueEvent } from "@/modules/notifications/service";
import {
  addAttachment,
  attachmentSelect,
  type AttachmentInput,
} from "@/modules/attachments/service";
export const announcementCategories = [
  "GENERAL",
  "IMPORTANT",
  "EMERGENCY",
  "FINANCIAL",
  "MEETING",
  "SERVICE_INTERRUPTION",
] as const;
export const priorities = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
const schema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(3).max(10000),
  category: z.enum(announcementCategories),
  priority: z.enum(priorities),
  publishAt: z.date().nullable().optional(),
  expiresAt: z.date().nullable().optional(),
  audiences: z
    .array(
      z
        .object({
          kind: z.enum(["ALL", "OWNERS", "TENANTS", "UNITS", "BOARD"]),
          unitId: z.uuid().nullish(),
        })
        .refine((a) => (a.kind === "UNITS") === Boolean(a.unitId)),
    )
    .min(1)
    .max(25),
});
export async function saveAnnouncement(
  actor: Actor,
  input: unknown,
  file?: AttachmentInput,
) {
  communicationManager(actor);
  const data = schema.parse(input);
  if (data.expiresAt && data.expiresAt <= (data.publishAt || new Date()))
    fail("تاریخ انقضا باید پس از زمان انتشار باشد.");
  return db.$transaction(async (tx) => {
    await rateLimit(tx, actor.id, "announcement", 60);
    const { id, audiences, ...fields } = data;
    let record;
    if (id) {
      await lock(tx, "announcement:" + id);
      const previous = await tx.announcement.findUniqueOrThrow({
        where: { id },
      });
      if (!["DRAFT", "SCHEDULED"].includes(previous.status))
        return fail("اطلاعیه منتشرشده را بایگانی و نسخه جدید منتشر کنید.");
      await tx.announcementAudience.deleteMany({
        where: { announcementId: id },
      });
      record = await tx.announcement.update({
        where: { id },
        data: {
          ...fields,
          priority: data.category === "EMERGENCY" ? "CRITICAL" : data.priority,
          status: "DRAFT",
          scheduledById: null,
          revision: { increment: 1 },
        },
      });
    } else
      record = await tx.announcement.create({
        data: {
          ...fields,
          priority: data.category === "EMERGENCY" ? "CRITICAL" : data.priority,
          authorId: actor.id,
        },
      });
    const unique = new Map(
      audiences.map((a) => [a.kind + ":" + (a.unitId || ""), a]),
    );
    await tx.announcementAudience.createMany({
      data: [...unique.values()].map((a) => ({
        announcementId: record.id,
        ...a,
      })),
    });
    await addAttachment(tx, actor, { announcementId: record.id }, file);
    await audit(
      "communication.announcement.save",
      actor.id,
      record.id,
      { revision: record.revision },
      tx,
    );
    return record;
  });
}
export async function publishAnnouncement(
  actor: Actor,
  id: string,
  now = new Date(),
  expectedRevision?: number,
) {
  communicationManager(actor);
  z.uuid().parse(id);
  return db.$transaction(
    async (tx) => {
      await lock(tx, "announcement:" + id);
      const record = await tx.announcement.findUniqueOrThrow({
        where: { id },
        include: { audiences: true },
      });
      if (
        expectedRevision !== undefined &&
        (record.status !== "SCHEDULED" ||
          record.revision !== expectedRevision ||
          !record.publishAt ||
          record.publishAt > now)
      )
        return record;
      if (record.status === "PUBLISHED") return record;
      if (record.status === "ARCHIVED") return fail("اطلاعیه بایگانی شده است.");
      if (record.expiresAt && record.expiresAt <= now)
        fail("اطلاعیه منقضی شده است.");
      if (record.publishAt && record.publishAt > now) {
        const scheduled = await tx.announcement.update({
          where: { id },
          data: { status: "SCHEDULED", scheduledById: actor.id },
        });
        await queueEvent(
          tx,
          `publish:${id}:${record.revision}`,
          "COMM_PUBLISH",
          { id, revision: record.revision, actorId: actor.id },
          record.publishAt,
        );
        await audit(
          "communication.announcement.schedule",
          actor.id,
          id,
          {},
          tx,
        );
        return scheduled;
      }
      const recipients = await audienceUsers(
        record.audiences as Audience[],
        tx,
      );
      for (const user of recipients) {
        await tx.announcementRecipient.upsert({
          where: {
            announcementId_userId: { announcementId: id, userId: user.id },
          },
          create: { announcementId: id, userId: user.id },
          update: {},
        });
        if (user.id !== actor.id) {
          const threadId = randomUUID();
          const fullText = record.title + "\n\n" + record.content;
          for (let offset = 0; offset < fullText.length; offset += 4000) {
            await tx.inboxMessage.create({ data: {
              id: offset === 0 ? threadId : randomUUID(), threadId,
              senderId: actor.id, recipientId: user.id, subject: record.title, body: fullText.slice(offset, offset + 4000),
            } });
          }
        }
        const mandatory = record.category === "EMERGENCY";
        await emitNotification(tx, {
          userId: user.id,
          eventKey: "announcement:" + id,
          category: mandatory
            ? "operational"
            : record.category === "FINANCIAL"
              ? "financial"
              : record.category === "MEETING"
                ? "meetings"
                : "general",
          title: mandatory ? "اطلاعیه اضطراری ساختمان" : record.title,
          body: mandatory
            ? "اطلاعیه مهم عملیاتی منتشر شده است."
            : "اطلاعیه جدید ساختمان برای شما منتشر شد.",
          href: "/announcements/" + id,
          mandatory,
        });
      }
      const published = await tx.announcement.update({
        where: { id },
        data: {
          status: "PUBLISHED",
          publishedAt: now,
          publishedById: actor.id,
        },
      });
      await audit(
        "communication.announcement.publish",
        actor.id,
        id,
        { recipients: recipients.length },
        tx,
      );
      return published;
    },
    { timeout: 30000 },
  );
}
export async function publishScheduled(
  id: string,
  revision: number,
  actorId: string,
  now = new Date(),
) {
  const record = await db.announcement.findUniqueOrThrow({ where: { id } });
  if (
    record.status !== "SCHEDULED" ||
    record.revision !== revision ||
    !record.publishAt ||
    record.publishAt > now
  )
    return;
  const actor = await db.user.findUniqueOrThrow({
    where: { id: actorId },
    include: { roles: { include: { role: true } } },
  });
  return publishAnnouncement(actor, id, now, revision);
}
export async function archiveAnnouncement(actor: Actor, id: string) {
  communicationManager(actor);
  return db.$transaction(async (tx) => {
    await lock(tx, "announcement:" + id);
    const record = await tx.announcement.findUniqueOrThrow({ where: { id } });
    if (record.status === "ARCHIVED") return record;
    const updated = await tx.announcement.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
    await audit("communication.announcement.archive", actor.id, id, {}, tx);
    return updated;
  });
}
export async function announcementList(
  actor: Actor,
  options: { page?: number; history?: boolean; manage?: boolean } = {},
) {
  await member(actor);
  if (options.manage) communicationManager(actor);
  const page = pageNumber(options.page);
  const where = options.manage
    ? {}
    : {
        status: options.history ? "ARCHIVED" : "PUBLISHED",
        ...(options.history
          ? {}
          : { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }),
        recipients: { some: { userId: actor.id } },
      };
  const [rows, total, reads] = await Promise.all([
    db.announcement.findMany({
      where,
      select: {
        id: true,
        title: true,
        category: true,
        priority: true,
        status: true,
        publishAt: true,
        publishedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    db.announcement.count({ where }),
    db.announcementRead.findMany({
      where: { userId: actor.id },
      select: { announcementId: true },
    }),
  ]);
  const read = new Set(reads.map((r) => r.announcementId));
  return {
    rows: rows.map((r) => ({ ...r, isRead: read.has(r.id) })),
    total,
    page,
  };
}
export async function getAnnouncement(actor: Actor, id: string) {
  await member(actor);
  z.uuid().parse(id);
  const manager = canManage(actor);
  const record = await db.announcement.findFirst({
    where: {
      id,
      ...(!manager
        ? {
            status: { in: ["PUBLISHED", "ARCHIVED"] },
            recipients: { some: { userId: actor.id } },
          }
        : {}),
    },
    include: { audiences: manager },
  });
  if (!record) return fail("اطلاعیه در دسترس نیست.");
  const [read, attachments, author] = await Promise.all([
    db.announcementRead.findUnique({
      where: {
        announcementId_userId: { announcementId: id, userId: actor.id },
      },
    }),
    db.communicationAttachment.findMany({
      where: { announcementId: id },
      select: attachmentSelect,
    }),
    db.user.findUniqueOrThrow({
      where: { id: record.authorId },
      select: { name: true },
    }),
  ]);
  const recipient = await db.announcementRecipient.findUnique({
    where: { announcementId_userId: { announcementId: id, userId: actor.id } },
  });
  return {
    ...record,
    authorName: author.name,
    attachments,
    isRead: Boolean(read),
    isRecipient: Boolean(recipient),
    manager,
  };
}
export async function readAnnouncement(actor: Actor, id: string) {
  const record = await getAnnouncement(actor, id);
  if (!record.isRecipient) fail("رسید مطالعه برای این حساب ثبت نمی‌شود.");
  return db.$transaction(async (tx) => {
    const read = await tx.announcementRead.upsert({
      where: {
        announcementId_userId: { announcementId: id, userId: actor.id },
      },
      create: { announcementId: id, userId: actor.id },
      update: {},
    });
    await tx.notification.updateMany({
      where: { userId: actor.id, eventKey: "announcement:" + id, readAt: null },
      data: { readAt: new Date() },
    });
    return read;
  });
}
export async function announcementStats(actor: Actor, id: string) {
  communicationManager(actor);
  const [recipients, read, channels] = await Promise.all([
    db.announcementRecipient.count({ where: { announcementId: id } }),
    db.announcementRead.count({ where: { announcementId: id } }),
    db.notificationDelivery.groupBy({
      by: ["channel", "status"],
      where: { notification: { eventKey: "announcement:" + id } },
      _count: true,
    }),
  ]);
  return { recipients, read, channels };
}
