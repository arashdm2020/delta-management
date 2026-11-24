import { z } from "zod";
import { db } from "@/lib/db";
import { type Actor, fail } from "@/lib/security/core";
import {
  communicationManager,
  lock,
  eligibleUsers,
  rateLimit,
} from "@/modules/notifications/common";
import { getMeeting } from "@/modules/meetings/service";
import { emitNotification } from "@/modules/notifications/service";
import { audit } from "@/modules/audit/service";
import {
  addAttachment,
  attachmentSelect,
  type AttachmentInput,
} from "@/modules/attachments/service";
import { jalaliInput, parseJalaliDate } from "@/modules/billing/calendar";
const schema = z
  .object({
    id: z.uuid().optional(),
    meetingId: z.uuid(),
    content: z.string().trim().min(5).max(10000),
    status: z.enum([
      "DRAFT",
      "PUBLISHED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ]),
    decisionAt: z.date().refine((d) => d.getTime() <= Date.now() + 60000),
    effectiveAt: z.date(),
    responsibleId: z.uuid(),
    amendmentReason: z.string().trim().min(3).max(500).nullable().optional(),
  })
  .refine((v) => v.effectiveAt >= v.decisionAt);
export async function appendResolution(
  actor: Actor,
  input: unknown,
  file?: AttachmentInput,
) {
  communicationManager(actor);
  const data = schema.parse(input);
  return db.$transaction(async (tx) => {
    await rateLimit(tx, actor.id, "resolution", 60);
    await lock(tx, "meeting:" + data.meetingId);
    const meeting = await tx.meeting.findUniqueOrThrow({
      where: { id: data.meetingId },
    });
    if (
      meeting.status === "CANCELLED" ||
      data.decisionAt < parseJalaliDate(jalaliInput(meeting.startsAt)) ||
      (data.status !== "DRAFT" && meeting.startsAt > new Date())
    )
      fail("زمان تصمیم یا وضعیت جلسه معتبر نیست.");
    const responsible = (await eligibleUsers(tx)).find(
      (u) => u.id === data.responsibleId,
    );
    if (!responsible)
      return fail("مسئول مصوبه باید عضو تأییدشده و فعال ساختمان باشد.");
    let resolution;
    if (data.id) {
      resolution = await tx.resolution.findUniqueOrThrow({
        where: { id: data.id },
      });
      if (resolution.meetingId !== data.meetingId)
        fail("مصوبه متعلق به این جلسه نیست.");
    } else
      resolution = await tx.resolution.create({
        data: { meetingId: data.meetingId },
      });
    const previous = await tx.resolutionVersion.findFirst({
      where: { resolutionId: resolution.id },
      orderBy: { version: "desc" },
    });
    const finalized = await tx.resolutionVersion.count({
      where: { resolutionId: resolution.id, status: { not: "DRAFT" } },
    });
    if (finalized && !data.amendmentReason)
      fail("دلیل الحاقیه مصوبه نهایی لازم است.");
    const version = await tx.resolutionVersion.create({
      data: {
        resolutionId: resolution.id,
        version: (previous?.version || 0) + 1,
        content: data.content,
        status: data.status,
        decisionAt: data.decisionAt,
        effectiveAt: data.effectiveAt,
        responsibleId: data.responsibleId,
        responsibleName: responsible.name || "عضو ساختمان",
        authorId: actor.id,
        amendmentReason: data.amendmentReason,
      },
    });
    await addAttachment(tx, actor, { resolutionVersionId: version.id }, file);
    await audit(
      "communication.resolution.append",
      actor.id,
      resolution.id,
      {
        version: version.version,
        status: version.status,
        reason: data.amendmentReason || null,
      },
      tx,
    );
    if (data.status !== "DRAFT")
      for (const participant of await tx.meetingParticipant.findMany({
        where: { meetingId: meeting.id },
      }))
        await emitNotification(tx, {
          userId: participant.userId,
          eventKey: "resolution:" + version.id,
          category: "meetings",
          title: "مصوبه جلسه ثبت یا اصلاح شد",
          body: "متن و وضعیت مصوبه را در سامانه بررسی کنید.",
          href: "/meetings/" + meeting.id,
        });
    return { resolution, version };
  });
}
export async function resolutionsForMeeting(actor: Actor, meetingId: string) {
  const meeting = await getMeeting(actor, meetingId);
  const records = await db.resolution.findMany({
    where: { meetingId },
    include: {
      versions: {
        where: meeting.manager ? {} : { status: { not: "DRAFT" } },
        orderBy: { version: "desc" },
      },
    },
    orderBy: { number: "asc" },
  });
  const attachments = await db.communicationAttachment.findMany({
    where: {
      resolutionVersionId: {
        in: records.flatMap((r) => r.versions.map((v) => v.id)),
      },
    },
    select: { ...attachmentSelect, resolutionVersionId: true },
  });
  return records
    .filter((r) => r.versions.length)
    .map((r) => ({
      ...r,
      versions: r.versions.map((v) => ({
        ...v,
        attachments: attachments.filter((a) => a.resolutionVersionId === v.id),
      })),
    }));
}

export async function resolutionIndex(actor: Actor, rawPage = 1) {
  communicationManager(actor);
  const page = Math.max(
    1,
    Math.min(100000, Number.isSafeInteger(rawPage) ? rawPage : 1),
  );
  const [rows, total] = await Promise.all([
    db.resolution.findMany({
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      orderBy: { number: "desc" },
      take: 20,
      skip: (page - 1) * 20,
    }),
    db.resolution.count(),
  ]);
  const meetings = await db.meeting.findMany({
    where: { id: { in: rows.map((r) => r.meetingId) } },
    select: { id: true, title: true },
  });
  const names = new Map(meetings.map((m) => [m.id, m.title]));
  return {
    page,
    total,
    rows: rows.map((r) => ({ ...r, meetingTitle: names.get(r.meetingId) })),
  };
}
