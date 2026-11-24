import { z } from "zod";
import { db } from "@/lib/db";
import { type Actor, canManage, fail } from "@/lib/security/core";
import { audit } from "@/modules/audit/service";
import {
  member,
  communicationManager,
  rateLimit,
  lock,
  eligibleUsers,
  pageNumber,
} from "@/modules/notifications/common";
import { emitNotification } from "@/modules/notifications/service";
import {
  addAttachment,
  attachmentSelect,
  type AttachmentInput,
} from "@/modules/attachments/service";
export const ticketCategories = [
  "CLEANLINESS",
  "ELEVATOR",
  "LIGHTING",
  "WATER",
  "SHARED_AREA",
  "SECURITY",
  "SUGGESTION",
  "OTHER",
] as const;
export const ticketStatuses = [
  "OPEN",
  "UNDER_REVIEW",
  "IN_PROGRESS",
  "WAITING_FOR_RESIDENT",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
] as const;
export const ticketTransitions: Record<string, string[]> = {
  OPEN: [
    "UNDER_REVIEW",
    "IN_PROGRESS",
    "WAITING_FOR_RESIDENT",
    "RESOLVED",
    "CLOSED",
  ],
  UNDER_REVIEW: ["IN_PROGRESS", "WAITING_FOR_RESIDENT", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["WAITING_FOR_RESIDENT", "RESOLVED"],
  WAITING_FOR_RESIDENT: ["UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: [
    "UNDER_REVIEW",
    "IN_PROGRESS",
    "WAITING_FOR_RESIDENT",
    "RESOLVED",
    "CLOSED",
  ],
};
const createSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(10000),
  category: z.enum(ticketCategories),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]),
  unitId: z.uuid().nullable().optional(),
  requestKey: z.uuid(),
});
async function notifyManagers(
  tx: Parameters<typeof emitNotification>[0],
  ticketId: string,
  eventId: string,
  exclude: string,
) {
  const users = await eligibleUsers(tx);
  for (const user of users.filter(
    (u) => u.id !== exclude && canManage({ ...u, status: "APPROVED" }),
  ))
    await emitNotification(tx, {
      userId: user.id,
      eventKey: "ticket:" + eventId,
      category: "tickets",
      title: "درخواست ساختمان به‌روزرسانی شد",
      body: "درخواست نیازمند بررسی مدیریت است.",
      href: "/management/tickets/" + ticketId,
    });
}
export async function createTicket(
  actor: Actor,
  input: unknown,
  file?: AttachmentInput,
) {
  await member(actor);
  const data = createSchema.parse(input);
  return db.$transaction(async (tx) => {
    await lock(tx, "ticket-create:" + data.requestKey);
    const previous = await tx.ticket.findUnique({
      where: { requestKey: data.requestKey },
    });
    if (previous) {
      if (previous.creatorId !== actor.id) fail("درخواست مجاز نیست.");
      return previous;
    }
    await rateLimit(tx, actor.id, "ticket-create", 10);
    if (
      data.unitId &&
      !canManage(actor) &&
      !(await tx.unitMembership.findFirst({
        where: {
          unitId: data.unitId,
          userId: actor.id,
          startsAt: { lte: new Date() },
          endsAt: null,
          unit: { active: true },
        },
      }))
    )
      fail("واحد انتخاب‌شده به حساب شما متصل نیست.");
    const ticket = await tx.ticket.create({
      data: { ...data, creatorId: actor.id },
    });
    const event = await tx.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: actor.id,
        kind: "CREATED",
        status: "OPEN",
        reason: "ثبت درخواست",
      },
    });
    await addAttachment(tx, actor, { ticketId: ticket.id }, file);
    await audit("communication.ticket.create", actor.id, ticket.id, {}, tx);
    await notifyManagers(tx, ticket.id, event.id, actor.id);
    return ticket;
  });
}
export async function ticketList(
  actor: Actor,
  options: {
    page?: number;
    status?: string;
    category?: string;
    manage?: boolean;
  } = {},
) {
  await member(actor);
  if (options.manage) communicationManager(actor);
  const page = pageNumber(options.page);
  const where = {
    ...(!options.manage ? { creatorId: actor.id } : {}),
    ...(options.status
      ? { status: z.enum(ticketStatuses).parse(options.status) }
      : {}),
    ...(options.category
      ? { category: z.enum(ticketCategories).parse(options.category) }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.ticket.findMany({
      where,
      select: {
        id: true,
        number: true,
        title: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    db.ticket.count({ where }),
  ]);
  return { rows, total, page };
}
export async function getTicket(actor: Actor, id: string) {
  await member(actor);
  z.uuid().parse(id);
  const manager = canManage(actor);
  const ticket = await db.ticket.findFirst({
    where: { id, ...(!manager ? { creatorId: actor.id } : {}) },
    include: {
      comments: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) return fail("درخواست در دسترس نیست.");
  const ids = [
    ticket.creatorId,
    ...ticket.comments.map((c) => c.authorId),
    ...ticket.events.map((e) => e.actorId),
    ...(ticket.assignedToId ? [ticket.assignedToId] : []),
  ];
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const names = new Map(users.map((u) => [u.id, u.name || "عضو ساختمان"]));
  const attachments = await db.communicationAttachment.findMany({
    where: { ticketId: id },
    select: attachmentSelect,
  });
  return {
    ...ticket,
    manager,
    creatorName: names.get(ticket.creatorId),
    assignedName: ticket.assignedToId ? names.get(ticket.assignedToId) : null,
    comments: ticket.comments.map((c) => ({
      ...c,
      authorName: names.get(c.authorId),
    })),
    events: ticket.events.map((e) => ({
      ...e,
      actorName: names.get(e.actorId),
    })),
    attachments,
  };
}
export async function commentTicket(
  actor: Actor,
  id: string,
  content: string,
  requestKey: string,
  file?: AttachmentInput,
) {
  await getTicket(actor, id);
  z.uuid().parse(requestKey);
  z.string().trim().min(1).max(5000).parse(content);
  return db.$transaction(async (tx) => {
    await lock(tx, "ticket:" + id);
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { id } });
    const previous = await tx.ticketComment.findUnique({
      where: { requestKey },
    });
    if (previous) {
      if (previous.authorId !== actor.id || previous.ticketId !== id)
        fail("شناسه پاسخ معتبر نیست.");
      return previous;
    }
    if (["CLOSED", "RESOLVED"].includes(ticket.status))
      fail("ابتدا درخواست را بازگشایی کنید.");
    await rateLimit(tx, actor.id, "ticket-comment", 40);
    const comment = await tx.ticketComment.create({
      data: { ticketId: id, authorId: actor.id, content, requestKey },
    });
    const next =
      ticket.status === "WAITING_FOR_RESIDENT" && !canManage(actor)
        ? "UNDER_REVIEW"
        : ticket.status;
    await tx.ticket.update({
      where: { id },
      data: { status: next, updatedAt: new Date() },
    });
    const event = await tx.ticketEvent.create({
      data: {
        ticketId: id,
        actorId: actor.id,
        kind: "COMMENT",
        previousStatus: ticket.status,
        status: next,
        reason: canManage(actor) ? "پاسخ مدیریت" : "پاسخ ساکن",
      },
    });
    await addAttachment(tx, actor, { ticketId: id }, file);
    if (actor.id === ticket.creatorId)
      await notifyManagers(tx, id, event.id, actor.id);
    else
      await emitNotification(tx, {
        userId: ticket.creatorId,
        eventKey: "ticket:" + event.id,
        category: "tickets",
        title: "پاسخ جدید به درخواست شما",
        body: "پاسخ مدیریت در سامانه ثبت شد.",
        href: "/requests/" + id,
      });
    await audit("communication.ticket.comment", actor.id, id, {}, tx);
    return comment;
  });
}
export async function transitionTicket(
  actor: Actor,
  id: string,
  status: string,
  reason: string,
) {
  const visible = await getTicket(actor, id);
  z.enum(ticketStatuses).parse(status);
  z.string().trim().min(3).max(500).parse(reason);
  if (
    !visible.manager &&
    !(status === "REOPENED" && ["RESOLVED", "CLOSED"].includes(visible.status))
  )
    fail("تغییر وضعیت مجاز نیست.");
  return db.$transaction(async (tx) => {
    await lock(tx, "ticket:" + id);
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { id } });
    if (ticket.status === status) return ticket;
    if (
      !canManage(actor) &&
      !(status === "REOPENED" && ["RESOLVED", "CLOSED"].includes(ticket.status))
    )
      fail("بازگشایی در این وضعیت مجاز نیست.");
    if (!ticketTransitions[ticket.status]?.includes(status))
      fail("این تغییر وضعیت مجاز نیست.");
    await rateLimit(tx, actor.id, "ticket-status", 100);
    const updated = await tx.ticket.update({ where: { id }, data: { status } });
    const event = await tx.ticketEvent.create({
      data: {
        ticketId: id,
        actorId: actor.id,
        kind: "STATUS",
        previousStatus: ticket.status,
        status,
        reason,
      },
    });
    if (actor.id === ticket.creatorId)
      await notifyManagers(tx, id, event.id, actor.id);
    await emitNotification(tx, {
      userId: ticket.creatorId,
      eventKey: "ticket:" + event.id,
      category: "tickets",
      title: "وضعیت درخواست شما تغییر کرد",
      body: "آخرین وضعیت درخواست را در سامانه ببینید.",
      href: "/requests/" + id,
    });
    await audit(
      "communication.ticket.status",
      actor.id,
      id,
      { previous: ticket.status, status, reason },
      tx,
    );
    return updated;
  });
}
export async function assignTicket(
  actor: Actor,
  id: string,
  assignedToId: string | null,
) {
  communicationManager(actor);
  await getTicket(actor, id);
  if (assignedToId) {
    const user = await db.user.findUniqueOrThrow({
      where: { id: z.uuid().parse(assignedToId) },
      include: { roles: { include: { role: true } } },
    });
    if (!canManage(user)) fail("مسئول باید مدیر یا عضو مجاز هیئت‌مدیره باشد.");
  }
  return db.$transaction(async (tx) => {
    await lock(tx, "ticket:" + id);
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { id } });
    if (ticket.assignedToId === assignedToId) return ticket;
    const updated = await tx.ticket.update({
      where: { id },
      data: { assignedToId },
    });
    const event = await tx.ticketEvent.create({
      data: {
        ticketId: id,
        actorId: actor.id,
        kind: "ASSIGNMENT",
        status: ticket.status,
        reason: assignedToId ? "تعیین مسئول پیگیری" : "حذف مسئول پیگیری",
      },
    });
    if (assignedToId && assignedToId !== actor.id)
      await emitNotification(tx, {
        userId: assignedToId,
        eventKey: "ticket:" + event.id,
        category: "tickets",
        title: "درخواست جدید به شما ارجاع شد",
        body: "درخواست را در بخش مدیریت بررسی کنید.",
        href: "/management/tickets/" + id,
      });
    await audit(
      "communication.ticket.assign",
      actor.id,
      id,
      { assignedToId },
      tx,
    );
    return updated;
  });
}
