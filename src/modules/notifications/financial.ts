import { reminderPolicy } from "@/modules/sms/template-service";
import { db } from "@/lib/db";
import { type Actor } from "@/lib/security/core";
import { communicationManager, audienceUsers, lock } from "./common";
import { emitNotification, queueEvent } from "./service";
import { invoiceState } from "@/modules/financial-reports/service";
export async function financialEvent(
  event: string,
  id: string,
  now = new Date(),
) {
  const schedule = await reminderPolicy();
  return db.$transaction(async (tx) => {
    await lock(tx, "financial-notification:" + event + ":" + id);
    if (event === "POLICY") {
      const policy = await tx.chargePolicy.findUniqueOrThrow({ where: { id } });
      for (const user of await audienceUsers([{ kind: "ALL" }], tx))
        await emitNotification(tx, {
          userId: user.id,
          eventKey: "policy:" + policy.id,
          category: "financial",
          title: "سیاست شارژ ساختمان تغییر کرد",
          body: "تاریخ اثر و مبلغ سیاست شارژ را در بخش شارژ ببینید.",
          href: "/charges",
        });
      return;
    }
    if (event === "PAYMENT") {
      const payment = await tx.paymentIntent.findUniqueOrThrow({
        where: { id },
        include: { invoice: true },
      });
      if (payment.status !== "VERIFIED") return;
      await emitNotification(tx, {
        userId: payment.invoice.responsibleId,
        eventKey: "payment:" + id,
        category: "financial",
        title: "پرداخت شارژ تأیید شد",
        body: "رسید پرداخت شما در سامانه ثبت شده است.",
        href: "/payments/receipt/" + id,
      });
      return;
    }
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id },
      include: { allocations: true, corrections: true },
    });
    if (invoice.status !== "ISSUED") return;
    if (event !== "INVOICE") {
      if (invoiceState(invoice).outstanding <= 0n) return;
      const period = await tx.billingPeriod.findUniqueOrThrow({
        where: { id: invoice.periodId },
      });
      if (
        event === "UPCOMING" &&
        (period.dueAt <= now ||
          period.dueAt.getTime() >
            now.getTime() + schedule.beforeDueDays * 86400000)
      )
        return;
      if (
        event === "OVERDUE" &&
        now.getTime() < period.dueAt.getTime() + schedule.overdueDays * 86400000
      )
        return;
      if (
        event === "FOLLOWUP" &&
        (schedule.followupDays === null ||
          now.getTime() <
            period.dueAt.getTime() + schedule.followupDays * 86400000)
      )
        return;
    }
    await emitNotification(tx, {
      userId: invoice.responsibleId,
      eventKey: `invoice:${id}:${event}`,
      category: "financial",
      title:
        event === "INVOICE"
          ? "صورتحساب جدید صادر شد"
          : event === "UPCOMING"
            ? "سررسید شارژ نزدیک است"
            : "یادآوری شارژ پرداخت‌نشده",
      body: "جزئیات و آخرین مانده صورتحساب را در سامانه بررسی کنید.",
      href: "/charges/invoices/" + id,
    });
  });
}
export async function scanFinancialReminders(now = new Date()) {
  const schedule = await reminderPolicy();
  const invoices = await db.invoice.findMany({
    where: { status: "ISSUED" },
    include: { allocations: true, corrections: true },
  });
  let queued = 0;
  for (const invoice of invoices) {
    if (invoiceState(invoice).outstanding <= 0n) continue;
    const period = await db.billingPeriod.findUniqueOrThrow({
      where: { id: invoice.periodId },
    });
    const elapsed = now.getTime() - period.dueAt.getTime();
    const event =
      elapsed >= 0
        ? schedule.followupDays !== null &&
          elapsed >= schedule.followupDays * 86400000
          ? "FOLLOWUP"
          : elapsed >= schedule.overdueDays * 86400000
            ? "OVERDUE"
            : null
        : -elapsed <= schedule.beforeDueDays * 86400000
          ? "UPCOMING"
          : null;
    if (event) {
      await queueEvent(
        db,
        `reminder:${invoice.id}:${event}`,
        "COMM_FINANCIAL_EVENT",
        { id: invoice.id, event },
      );
      queued++;
    }
  }
  return queued;
}
export async function queueReminderScan(actor: Actor, now = new Date()) {
  communicationManager(actor);
  return queueEvent(
    db,
    "reminder-scan:" + now.toISOString().slice(0, 10),
    "COMM_SCAN_REMINDERS",
    {},
  );
}
