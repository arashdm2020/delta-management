import { reminderPolicy } from "@/modules/sms/template-service";
import { db } from "@/lib/db";
import { publishScheduled } from "@/modules/announcements/service";
import { remindMeeting } from "@/modules/meetings/service";
import { expireSubscriptions } from "@/modules/push/service";
import { processDelivery } from "./delivery";
import { financialEvent, scanFinancialReminders } from "./financial";
import { queueEvent } from "./service";
export async function processCommunicationJob(
  kind: string,
  payload: Record<string, unknown>,
) {
  switch (kind) {
    case "COMM_PUBLISH":
      await publishScheduled(
        String(payload.id),
        Number(payload.revision),
        String(payload.actorId),
      );
      break;
    case "COMM_DELIVERY":
      await processDelivery(String(payload.deliveryId));
      break;
    case "COMM_FINANCIAL_EVENT":
      await financialEvent(String(payload.event), String(payload.id));
      break;
    case "COMM_SCAN_REMINDERS":
      await scanFinancialReminders();
      break;
    case "COMM_MEETING_REMINDER":
      await remindMeeting(
        String(payload.id),
        Number(payload.revision),
        Number(payload.hours),
      );
      break;
    case "COMM_CLEANUP":
      await expireSubscriptions();
      await db.announcement.updateMany({
        where: { status: "PUBLISHED", expiresAt: { lte: new Date() } },
        data: { status: "ARCHIVED" },
      });
      break;
    case "NOTIFICATION_EVENT":
      if (payload.intentId)
        await financialEvent("PAYMENT", String(payload.intentId));
      else if (payload.period) {
        const period = await db.billingPeriod.findUnique({
          where: { key: String(payload.period) },
        });
        if (period)
          for (const invoice of await db.invoice.findMany({
            where: { periodId: period.id },
          }))
            await financialEvent("INVOICE", invoice.id);
      }
      break;
    default:
      throw new Error("UNKNOWN_JOB");
  }
}
export async function queueCommunicationMaintenance(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const schedule = await reminderPolicy();
  for (const meeting of await db.meeting.findMany({
    where: { status: "SCHEDULED", startsAt: { gt: now } },
  }))
    await queueEvent(
      db,
      `meeting-reminder:${meeting.id}:${meeting.revision}:${schedule.meetingHours}`,
      "COMM_MEETING_REMINDER",
      {
        id: meeting.id,
        revision: meeting.revision,
        hours: schedule.meetingHours,
      },
      new Date(
        Math.max(
          now.getTime(),
          meeting.startsAt.getTime() - schedule.meetingHours * 3600000,
        ),
      ),
    );

  await queueEvent(db, "communication-cleanup:" + day, "COMM_CLEANUP", {});
  // Periodic scans do not manufacture financial records; event keys deduplicate reminders.
  await queueEvent(
    db,
    "scheduled-financial-reminders:" + now.toISOString().slice(0, 13),
    "COMM_SCAN_REMINDERS",
    {},
  );
}
