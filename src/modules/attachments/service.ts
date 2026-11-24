import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { type Actor, fail } from "@/lib/security/core";
import { z } from "zod";
export type AttachmentInput = {
  name: string;
  mime: string;
  content: Uint8Array;
};
export function validateAttachment(document: AttachmentInput) {
  z.string().trim().min(1).max(200).parse(document.name);
  if (
    document.content.length > 2097152 ||
    !document.content.length ||
    !["application/pdf", "image/png", "image/jpeg"].includes(document.mime)
  )
    fail("پیوست باید PDF یا تصویر و حداکثر دو مگابایت باشد.");
  const bytes = document.content;
  const valid =
    document.mime === "application/pdf"
      ? new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
      : document.mime === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid) fail("محتوای پیوست با نوع فایل مطابقت ندارد.");
}
export async function addAttachment(
  tx: Prisma.TransactionClient,
  actor: Actor,
  parent: {
    announcementId?: string;
    ticketId?: string;
    meetingId?: string;
    minutesId?: string;
    resolutionVersionId?: string;
  },
  file?: AttachmentInput,
) {
  if (!file) return;
  validateAttachment(file);
  return tx.communicationAttachment.create({
    data: {
      ...parent,
      uploaderId: actor.id,
      ...file,
      content: new Uint8Array(file.content),
    },
  });
}
export async function authorizedAttachment(actor: Actor, id: string) {
  z.uuid().parse(id);
  const record = await db.communicationAttachment.findUniqueOrThrow({
    where: { id },
    select: {
      announcementId: true,
      ticketId: true,
      meetingId: true,
      minutesId: true,
      resolutionVersionId: true,
    },
  });
  if (record.announcementId) {
    const { getAnnouncement } = await import("@/modules/announcements/service");
    await getAnnouncement(actor, record.announcementId);
  } else if (record.ticketId) {
    const { getTicket } = await import("@/modules/tickets/service");
    await getTicket(actor, record.ticketId);
  } else if (
    record.meetingId ||
    record.minutesId ||
    record.resolutionVersionId
  ) {
    let meetingId = record.meetingId;
    let isFinal = true;
    if (record.minutesId) {
      const minutes = await db.meetingMinutes.findUniqueOrThrow({
        where: { id: record.minutesId },
      });
      meetingId = minutes.meetingId;
      isFinal = minutes.status === "FINAL";
    }
    if (record.resolutionVersionId) {
      const version = await db.resolutionVersion.findUniqueOrThrow({
        where: { id: record.resolutionVersionId },
        include: { resolution: true },
      });
      meetingId = version.resolution.meetingId;
      isFinal = version.status !== "DRAFT";
    }
    const { getMeeting } = await import("@/modules/meetings/service");
    const meeting = await getMeeting(actor, meetingId!);
    if (!isFinal && !meeting.manager) fail("پیوست پیش‌نویس در دسترس نیست.");
  }
  return db.communicationAttachment.findUniqueOrThrow({ where: { id } });
}
export const attachmentSelect = {
  id: true,
  name: true,
  mime: true,
  createdAt: true,
} as const;
