"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApproved } from "@/modules/auth/session";
import { assertOrigin } from "@/modules/auth/http";
import { DomainError } from "@/lib/security/core";
import { db } from "@/lib/db";
import {
  saveAnnouncement,
  publishAnnouncement,
  archiveAnnouncement,
  readAnnouncement,
} from "@/modules/announcements/service";
import {
  createTicket,
  commentTicket,
  transitionTicket,
  assignTicket,
} from "@/modules/tickets/service";
import {
  saveMeeting,
  rsvpMeeting,
  recordAttendance,
  appendMinutes,
  changeMeetingStatus,
} from "@/modules/meetings/service";
import { appendResolution } from "@/modules/governance/service";
import {
  savePreferences,
  markNotification,
  markAllNotifications,
} from "./service";
import { revokeSubscription } from "@/modules/push/service";
import { queueReminderScan } from "./financial";
import { parseTehranDateTime } from "./calendar";
import { parseJalaliDate } from "@/modules/billing/calendar";
import type { AttachmentInput } from "@/modules/attachments/service";
export type CommunicationResult = { ok: boolean; message: string };
export async function communicationAction(
  _previous: CommunicationResult,
  form: FormData,
): Promise<CommunicationResult> {
  const actor = await requireApproved();
  await assertOrigin();
  const value = (key: string) => String(form.get(key) || "");
  const id = (key = "id") => z.uuid().parse(value(key));
  let destination = "";
  async function file(): Promise<AttachmentInput | undefined> {
    const upload = form.get("document");
    if (!(upload instanceof File) || !upload.size) return;
    if (upload.size > 2097152)
      throw new DomainError("FILE", "پیوست باید حداکثر دو مگابایت باشد.");
    return {
      name: upload.name,
      mime: upload.type,
      content: new Uint8Array(await upload.arrayBuffer()),
    };
  }
  try {
    switch (value("operation")) {
      case "announcement-save": {
        const kind = z
          .enum(["ALL", "OWNERS", "TENANTS", "UNITS", "BOARD"])
          .parse(value("audienceKind"));
        const audiences =
          kind === "UNITS"
            ? form
                .getAll("unitId")
                .map((unitId) => ({ kind, unitId: String(unitId) }))
            : [{ kind }];
        const record = await saveAnnouncement(
          actor,
          {
            id: value("id") || undefined,
            title: value("title"),
            content: value("content"),
            category: value("category"),
            priority: value("priority"),
            publishAt: value("publishDate")
              ? parseTehranDateTime(
                  value("publishDate"),
                  value("publishTime") || "09:00",
                )
              : null,
            expiresAt: value("expiresDate")
              ? parseTehranDateTime(value("expiresDate"), "23:59")
              : null,
            audiences,
          },
          await file(),
        );
        destination = "/management/announcements/" + record.id;
        break;
      }
      case "announcement-publish":
        await publishAnnouncement(actor, id());
        break;
      case "announcement-archive":
        await archiveAnnouncement(actor, id());
        break;
      case "announcement-read":
        await readAnnouncement(actor, id());
        break;
      case "notification-read":
        await markNotification(actor, id(), value("read") !== "false");
        break;
      case "notification-all":
        await markAllNotifications(actor);
        break;
      case "notification-open": {
        await markNotification(actor, id());
        const record = await db.notification.findFirstOrThrow({
          where: { id: id(), userId: actor.id },
          select: { href: true },
        });
        destination = record.href;
        break;
      }
      case "preferences":
        await savePreferences(actor, {
          general: form.has("general"),
          financial: form.has("financial"),
          meetings: form.has("meetings"),
          tickets: form.has("tickets"),
          push: form.has("push"),
          sms: form.has("sms"),
        });
        break;
      case "push-revoke":
        await revokeSubscription(actor, id());
        break;
      case "ticket-create": {
        const ticket = await createTicket(
          actor,
          {
            title: value("title"),
            description: value("description"),
            category: value("category"),
            priority: value("priority"),
            unitId: value("unitId") || null,
            requestKey: value("requestKey"),
          },
          await file(),
        );
        destination = "/requests/" + ticket.id;
        break;
      }
      case "ticket-comment":
        await commentTicket(
          actor,
          id(),
          value("content"),
          id("requestKey"),
          await file(),
        );
        break;
      case "ticket-status":
        await transitionTicket(actor, id(), value("status"), value("reason"));
        break;
      case "ticket-assign":
        await assignTicket(actor, id(), value("userId") || null);
        break;
      case "meeting-save": {
        const meeting = await saveMeeting(
          actor,
          {
            id: value("id") || undefined,
            title: value("title"),
            description: value("description"),
            agenda: value("agenda"),
            kind: value("kind"),
            startsAt: parseTehranDateTime(value("date"), value("time")),
            location: value("location"),
            onlineUrl: value("onlineUrl") || null,
          },
          await file(),
        );
        destination = "/management/meetings/" + meeting.id;
        break;
      }
      case "meeting-rsvp":
        await rsvpMeeting(actor, id(), value("rsvp"));
        break;
      case "meeting-attendance":
        await recordAttendance(
          actor,
          id(),
          id("userId"),
          value("attendance"),
          value("reason"),
        );
        break;
      case "meeting-status":
        await changeMeetingStatus(
          actor,
          id(),
          value("status"),
          value("reason"),
        );
        break;
      case "minutes":
        await appendMinutes(
          actor,
          id(),
          value("content"),
          value("status"),
          value("reason") || null,
          await file(),
        );
        break;
      case "resolution":
        await appendResolution(
          actor,
          {
            id: value("id") || undefined,
            meetingId: id("meetingId"),
            content: value("content"),
            status: value("status"),
            decisionAt: parseJalaliDate(value("decisionDate")),
            effectiveAt: parseJalaliDate(value("effectiveDate")),
            responsibleId: id("responsibleId"),
            amendmentReason: value("reason") || null,
          },
          await file(),
        );
        break;
      case "financial-reminders":
        await queueReminderScan(actor);
        break;
      default:
        throw new DomainError("FORM", "عملیات معتبر نیست.");
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof DomainError
          ? error.message
          : error instanceof z.ZodError
            ? "اطلاعات فرم معتبر نیست؛ تاریخ، متن و گزینه‌ها را بررسی کنید."
            : "عملیات ثبت نشد؛ مجوز، وضعیت یا تداخل سوابق را بررسی کنید.",
    };
  }
  for (const path of [
    "/announcements",
    "/notifications",
    "/requests",
    "/meetings",
    "/settings",
    "/management",
  ])
    revalidatePath(path, "layout");
  if (destination) redirect(destination);
  return { ok: true, message: "تغییرات ارتباطی با موفقیت ثبت شد." };
}
