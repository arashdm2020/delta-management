import { db } from "@/lib/db";
import { jalali } from "@/lib/dates";
import { rialToToman } from "@/lib/utils";
import { invoiceState } from "@/modules/financial-reports/service";
import { reminderPolicy } from "./template-service";
import { inboxSmsText, type SmsEvent } from "./events";
const day = 86400000;
export async function resolveNotificationSms(
  notificationId: string,
  now = new Date(),
): Promise<SmsEvent | null> {
  const notification = await db.notification.findUniqueOrThrow({
    where: { id: notificationId },
  });
  const [kind, id, stage, extra] = notification.eventKey.split(":");
  if (kind === "inbox") {
    const message = await db.inboxMessage.findFirst({
      where: { id, recipientId: notification.userId, readAt: null },
      select: { id: true },
    });
    return message ? { event: "inbox.message", payload: { message: inboxSmsText } } : null;
  }
  if (kind === "invoice") {
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { corrections: true, allocations: true },
    });
    if (
      !invoice ||
      invoice.status !== "ISSUED" ||
      invoice.responsibleId !== notification.userId
    )
      return null;
    const period = await db.billingPeriod.findUniqueOrThrow({
      where: { id: invoice.periodId },
    });
    const state = invoiceState(invoice);
    if (stage === "INVOICE")
      return {
        event: "billing.invoice.issued",
        payload: {
          period: new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
            timeZone: "Asia/Tehran",
            year: "numeric",
            month: "long",
          }).format(period.startsAt),
          unit: invoice.unitNumber,
          amount: rialToToman(state.amount),
          due_date: jalali(period.dueAt),
        },
      };
    if (state.outstanding <= 0n) return null;
    const schedule = await reminderPolicy();
    if (
      stage === "UPCOMING" &&
      (now >= period.dueAt ||
        now.getTime() < period.dueAt.getTime() - schedule.beforeDueDays * day)
    )
      return null;
    if (
      stage === "OVERDUE" &&
      now.getTime() < period.dueAt.getTime() + schedule.overdueDays * day
    )
      return null;
    if (
      stage === "FOLLOWUP" &&
      (schedule.followupDays === null ||
        now.getTime() < period.dueAt.getTime() + schedule.followupDays * day)
    )
      return null;
    const payload = {
      unit: invoice.unitNumber,
      amount: rialToToman(state.outstanding),
      due_date: jalali(period.dueAt),
    };
    if (stage === "UPCOMING")
      return { event: "billing.invoice.reminder", payload };
    if (stage === "OVERDUE" || stage === "FOLLOWUP")
      return { event: "billing.invoice.overdue", payload };
  }
  if (kind === "payment") {
    const payment = await db.paymentIntent.findUnique({
      where: { id },
      include: { invoice: true },
    });
    if (
      !payment ||
      payment.status !== "VERIFIED" ||
      payment.invoice.responsibleId !== notification.userId
    )
      return null;
    return {
      event: "billing.payment.confirmed",
      payload: {
        unit: payment.invoice.unitNumber,
        amount: rialToToman(payment.amount),
        receipt: payment.id,
      },
    };
  }
  if (kind === "meeting" || kind === "meeting-reminder") {
    const meeting = await db.meeting.findUnique({ where: { id } });
    if (
      !meeting ||
      meeting.status !== "SCHEDULED" ||
      meeting.revision !== Number(stage) ||
      meeting.startsAt <= now ||
      !(await db.meetingParticipant.count({
        where: { meetingId: id, userId: notification.userId },
      }))
    )
      return null;
    const payload = {
      title: meeting.title,
      date: jalali(meeting.startsAt),
      time: new Intl.DateTimeFormat("fa-IR", {
        timeZone: "Asia/Tehran",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(meeting.startsAt),
    };
    if (kind === "meeting")
      return {
        event: "meeting.invitation",
        payload: { ...payload, location: meeting.location },
      };
    const config = await reminderPolicy();
    if (
      Number(extra) !== config.meetingHours ||
      now.getTime() < meeting.startsAt.getTime() - config.meetingHours * 3600000
    )
      return null;
    return { event: "meeting.reminder", payload };
  }
  if (kind === "ticket") {
    const event = await db.ticketEvent.findUnique({
      where: { id },
      include: { ticket: true },
    });
    if (
      !event ||
      event.ticket.creatorId !== notification.userId ||
      event.previousStatus === event.status ||
      !["STATUS", "COMMENT"].includes(event.kind)
    )
      return null;
    const statuses: Record<string, string> = {
      OPEN: "باز",
      UNDER_REVIEW: "در حال بررسی",
      IN_PROGRESS: "در حال انجام",
      WAITING_FOR_RESIDENT: "در انتظار ساکن",
      RESOLVED: "حل‌شده",
      CLOSED: "بسته",
      REOPENED: "بازگشایی‌شده",
    };
    return {
      event: "ticket.status.changed",
      payload: {
        ticket: String(event.ticket.number),
        status: statuses[event.status] || event.status,
      },
    };
  }
  if (kind === "announcement") {
    const announcement = await db.announcement.findUnique({ where: { id } });
    if (
      !announcement ||
      announcement.category !== "EMERGENCY" ||
      announcement.status !== "PUBLISHED" ||
      (announcement.expiresAt && announcement.expiresAt <= now) ||
      !(await db.announcementRecipient.count({
        where: { announcementId: id, userId: notification.userId },
      }))
    )
      return null;
    return {
      event: "announcement.emergency",
      payload: {
        message:
          "اطلاعیه اضطراری ساختمان؛ برای مشاهده جزئیات وارد سامانه شوید.",
      },
    };
  }
  return null;
}
