import { reminderPolicy } from "@/modules/sms/template-service";
import { z } from "zod";
import { db } from "@/lib/db";
import { type Actor, canManage, fail } from "@/lib/security/core";
import { audit } from "@/modules/audit/service";
import {
  member,
  communicationManager,
  rateLimit,
  lock,
  audienceUsers,
  pageNumber,
} from "@/modules/notifications/common";
import { emitNotification, queueEvent } from "@/modules/notifications/service";
import {
  addAttachment,
  attachmentSelect,
  type AttachmentInput,
} from "@/modules/attachments/service";
const schema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(10000),
  agenda: z.string().trim().min(3).max(10000),
  kind: z.enum(["BOARD", "OWNERS", "GENERAL"]),
  startsAt: z.date(),
  location: z.string().trim().min(2).max(300),
  onlineUrl: z
    .string()
    .url()
    .max(1000)
    .refine((v) => new URL(v).protocol === "https:")
    .nullable()
    .optional(),
});
export async function saveMeeting(
  actor: Actor,
  input: unknown,
  file?: AttachmentInput,
) {
  communicationManager(actor);
  const data = schema.parse(input);
  return db.$transaction(
    async (tx) => {
      await rateLimit(tx, actor.id, "meeting", 50);
      const { id, ...fields } = data;
      let meeting;
      if (id) {
        await lock(tx, "meeting:" + id);
        const previous = await tx.meeting.findUniqueOrThrow({ where: { id } });
        if (
          previous.status !== "SCHEDULED" ||
          previous.kind !== data.kind ||
          (await tx.meetingMinutes.count({
            where: { meetingId: id, status: "FINAL" },
          }))
        )
          return fail("جلسه نهایی‌شده یا نوع مخاطبان قابل تغییر نیست.");
        meeting = await tx.meeting.update({
          where: { id },
          data: { ...fields, revision: { increment: 1 } },
        });
      } else
        meeting = await tx.meeting.create({
          data: { ...fields, authorId: actor.id },
        });
      if (!id) {
        const participants = await audienceUsers(
          [
            {
              kind:
                data.kind === "BOARD"
                  ? "BOARD"
                  : data.kind === "OWNERS"
                    ? "OWNERS"
                    : "ALL",
            },
          ],
          tx,
        );
        for (const user of participants)
          await tx.meetingParticipant.create({
            data: { meetingId: meeting.id, userId: user.id },
          });
      }
      const participants = await tx.meetingParticipant.findMany({
        where: { meetingId: meeting.id },
      });
      for (const participant of participants)
        await emitNotification(tx, {
          userId: participant.userId,
          eventKey: `meeting:${meeting.id}:${meeting.revision}`,
          category: "meetings",
          title: id ? "زمان یا اطلاعات جلسه تغییر کرد" : "دعوت به جلسه ساختمان",
          body: "اطلاعات و دستور جلسه در سامانه در دسترس است.",
          href: "/meetings/" + meeting.id,
        });
      for (const hours of [
        ...new Set([24, 1, (await reminderPolicy()).meetingHours]),
      ])
        await queueEvent(
          tx,
          `meeting-reminder:${meeting.id}:${meeting.revision}:${hours}`,
          "COMM_MEETING_REMINDER",
          { id: meeting.id, revision: meeting.revision, hours },
          new Date(
            Math.max(Date.now(), meeting.startsAt.getTime() - hours * 3600000),
          ),
        );
      await addAttachment(tx, actor, { meetingId: meeting.id }, file);
      await audit(
        "communication.meeting.save",
        actor.id,
        meeting.id,
        { revision: meeting.revision },
        tx,
      );
      return meeting;
    },
    { timeout: 20000 },
  );
}
export async function meetingList(
  actor: Actor,
  options: { page?: number; manage?: boolean } = {},
) {
  await member(actor);
  if (options.manage) communicationManager(actor);
  const page = pageNumber(options.page);
  const where = options.manage
    ? {}
    : { participants: { some: { userId: actor.id } } };
  const [rows, total] = await Promise.all([
    db.meeting.findMany({
      where,
      select: {
        id: true,
        title: true,
        kind: true,
        status: true,
        startsAt: true,
        location: true,
      },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    db.meeting.count({ where }),
  ]);
  return { rows, total, page };
}
export async function getMeeting(actor: Actor, id: string) {
  await member(actor);
  z.uuid().parse(id);
  const manager = canManage(actor);
  const meeting = await db.meeting.findFirst({
    where: {
      id,
      ...(!manager ? { participants: { some: { userId: actor.id } } } : {}),
    },
  });
  if (!meeting) return fail("جلسه در دسترس نیست.");
  const [me, minutes, attachments, participants] = await Promise.all([
    db.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: id, userId: actor.id } },
    }),
    db.meetingMinutes.findMany({
      where: { meetingId: id, ...(!manager ? { status: "FINAL" } : {}) },
      orderBy: { version: "desc" },
    }),
    db.communicationAttachment.findMany({
      where: { meetingId: id },
      select: attachmentSelect,
    }),
    manager
      ? db.meetingParticipant.findMany({
          where: { meetingId: id },
          orderBy: { userId: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const names = manager
    ? await db.user.findMany({
        where: { id: { in: participants.map((p) => p.userId) } },
        select: { id: true, name: true },
      })
    : [];
  const nameMap = new Map(names.map((u) => [u.id, u.name]));
  const minutesAttachments = await db.communicationAttachment.findMany({
    where: { minutesId: { in: minutes.map((m) => m.id) } },
    select: { ...attachmentSelect, minutesId: true },
  });
  return {
    ...meeting,
    manager,
    me,
    minutes: minutes.map((m) => ({
      ...m,
      attachments: minutesAttachments.filter((a) => a.minutesId === m.id),
    })),
    attachments,
    participants: participants.map((p) => ({
      ...p,
      name: nameMap.get(p.userId) || "عضو ساختمان",
    })),
  };
}
export async function rsvpMeeting(actor: Actor, id: string, rsvp: string) {
  await getMeeting(actor, id);
  z.enum(["YES", "NO"]).parse(rsvp);
  return db.$transaction(async (tx) => {
    await lock(tx, "meeting:" + id);
    const meeting = await tx.meeting.findUniqueOrThrow({ where: { id } });
    if (meeting.status !== "SCHEDULED")
      fail("مهلت پاسخ به دعوت پایان یافته است.");
    const result = await tx.meetingParticipant.updateMany({
      where: { meetingId: id, userId: actor.id },
      data: { rsvp },
    });
    if (!result.count) fail("شما در فهرست دعوت‌شدگان نیستید.");
    await audit("communication.meeting.rsvp", actor.id, id, { rsvp }, tx);
  });
}
export async function recordAttendance(
  actor: Actor,
  id: string,
  userId: string,
  attendance: string,
  reason: string,
) {
  communicationManager(actor);
  z.enum(["PRESENT", "ABSENT"]).parse(attendance);
  z.string().trim().min(3).max(500).parse(reason);
  return db.$transaction(async (tx) => {
    await lock(tx, "meeting:" + id);
    const meeting = await tx.meeting.findUniqueOrThrow({ where: { id } });
    if (meeting.status === "CANCELLED" || meeting.startsAt > new Date())
      fail("حضور برای جلسه لغوشده یا شروع‌نشده ثبت نمی‌شود.");
    const previous = await tx.meetingParticipant.findUniqueOrThrow({
      where: { meetingId_userId: { meetingId: id, userId } },
    });
    if (previous.attendance === attendance) return previous;
    const participant = await tx.meetingParticipant.update({
      where: { meetingId_userId: { meetingId: id, userId } },
      data: { attendance, recordedById: actor.id, recordedAt: new Date() },
    });
    await audit(
      "communication.meeting.attendance",
      actor.id,
      id,
      { userId, previous: previous.attendance, attendance, reason },
      tx,
    );
    return participant;
  });
}
export async function appendMinutes(
  actor: Actor,
  meetingId: string,
  content: string,
  status: string,
  reason: string | null,
  file?: AttachmentInput,
) {
  communicationManager(actor);
  z.string().trim().min(5).max(20000).parse(content);
  z.enum(["DRAFT", "FINAL"]).parse(status);
  return db.$transaction(async (tx) => {
    await lock(tx, "meeting:" + meetingId);
    const meeting = await tx.meeting.findUniqueOrThrow({
      where: { id: meetingId },
    });
    if (
      meeting.status === "CANCELLED" ||
      (status === "FINAL" && meeting.startsAt > new Date())
    )
      fail("صورت‌جلسه نهایی برای این جلسه مجاز نیست.");
    const previous = await tx.meetingMinutes.findFirst({
      where: { meetingId },
      orderBy: { version: "desc" },
    });
    const finalized = await tx.meetingMinutes.count({
      where: { meetingId, status: "FINAL" },
    });
    if (finalized && !reason?.trim())
      fail("برای اصلاح صورت‌جلسه نهایی، دلیل الحاقیه لازم است.");
    const minutes = await tx.meetingMinutes.create({
      data: {
        meetingId,
        version: (previous?.version || 0) + 1,
        status,
        content,
        amendmentReason: reason,
        authorId: actor.id,
      },
    });
    await addAttachment(tx, actor, { minutesId: minutes.id }, file);
    await audit(
      "communication.minutes.append",
      actor.id,
      minutes.id,
      { meetingId, version: minutes.version, status, reason },
      tx,
    );
    if (status === "FINAL")
      for (const participant of await tx.meetingParticipant.findMany({
        where: { meetingId },
      }))
        await emitNotification(tx, {
          userId: participant.userId,
          eventKey: "minutes:" + minutes.id,
          category: "meetings",
          title: "صورت‌جلسه ساختمان ثبت شد",
          body: "نسخه نهایی یا الحاقیه صورت‌جلسه را بررسی کنید.",
          href: "/meetings/" + meetingId,
        });
    return minutes;
  });
}
export async function changeMeetingStatus(
  actor: Actor,
  id: string,
  status: string,
  reason: string,
) {
  communicationManager(actor);
  z.enum(["COMPLETED", "CANCELLED"]).parse(status);
  z.string().trim().min(3).max(500).parse(reason);
  return db.$transaction(async (tx) => {
    await lock(tx, "meeting:" + id);
    const meeting = await tx.meeting.findUniqueOrThrow({ where: { id } });
    if (meeting.status === status) return meeting;
    if (meeting.status !== "SCHEDULED")
      fail("وضعیت نهایی جلسه قابل تغییر نیست.");
    if (
      status === "COMPLETED" &&
      (meeting.startsAt > new Date() ||
        !(await tx.meetingMinutes.count({
          where: { meetingId: id, status: "FINAL" },
        })))
    )
      fail("شروع جلسه و صورت‌جلسه نهایی برای اتمام لازم است.");
    const updated = await tx.meeting.update({
      where: { id },
      data: { status },
    });
    for (const participant of await tx.meetingParticipant.findMany({
      where: { meetingId: id },
    }))
      await emitNotification(tx, {
        userId: participant.userId,
        eventKey: `meeting-status:${id}:${status}`,
        category: "meetings",
        title:
          status === "CANCELLED"
            ? "جلسه ساختمان لغو شد"
            : "جلسه ساختمان تکمیل شد",
        body: "جزئیات جلسه در سامانه ثبت شده است.",
        href: "/meetings/" + id,
      });
    await audit(
      "communication.meeting.status",
      actor.id,
      id,
      { status, reason },
      tx,
    );
    return updated;
  });
}
export async function remindMeeting(
  id: string,
  revision: number,
  hours: number,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    await lock(tx, "meeting:" + id);
    const meeting = await tx.meeting.findUniqueOrThrow({ where: { id } });
    if (
      meeting.status !== "SCHEDULED" ||
      meeting.revision !== revision ||
      meeting.startsAt <= now ||
      !Number.isInteger(hours) ||
      hours < 1 ||
      hours > 168 ||
      meeting.startsAt.getTime() - hours * 3600000 > now.getTime()
    )
      return;
    for (const participant of await tx.meetingParticipant.findMany({
      where: { meetingId: id },
    }))
      await emitNotification(tx, {
        userId: participant.userId,
        eventKey: `meeting-reminder:${id}:${revision}:${hours}`,
        category: "meetings",
        title: "یادآوری جلسه ساختمان",
        body: "زمان جلسه نزدیک است؛ دعوت و دستور جلسه را بررسی کنید.",
        href: "/meetings/" + id,
      });
  });
}
