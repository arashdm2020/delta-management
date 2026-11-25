import { queueEvent } from "@/modules/notifications/service";
import { db } from "@/lib/db";
import { type Actor, fail } from "@/lib/security/core";
import {
  manager,
  lock,
  post,
  pair,
  reverse,
} from "@/modules/accounting/service";
import { audit } from "@/modules/audit/service";
import { periodBounds } from "./calendar";
import { reasonSchema } from "./schemas";
export async function createPolicy(
  actor: Actor,
  amount: bigint,
  effectivePeriod: string,
  rawReason: string,
  approvalMinutesId?: string,
) {
  manager(actor);
  const { startsAt } = periodBounds(effectivePeriod);
  if (amount <= 0n || amount > 9223372036854775807n) fail("مبلغ معتبر نیست.");
  return db.$transaction(async (tx) => {
    await lock(tx, "charge-policy");
    const previous = await tx.chargePolicy.findFirst({
      orderBy: { startsAt: "desc" },
    });
    const reason = previous ? reasonSchema.parse(rawReason) : (rawReason.trim() ? reasonSchema.parse(rawReason) : "ثبت اولیهٔ شارژ");
    if (previous) {
      const minutes = approvalMinutesId
        ? await tx.meetingMinutes.findUnique({
            where: { id: approvalMinutesId },
            include: { meeting: true },
          })
        : null;
      if (
        !minutes ||
        minutes.status !== "FINAL" ||
        minutes.meeting.status === "CANCELLED" ||
        minutes.meeting.startsAt > new Date()
      )
        fail("تغییر شارژ به صورتجلسهٔ نهایی تصویب مبلغ نیاز دارد.");
    }
    if (previous && startsAt <= previous.startsAt)
      fail("تاریخ سیاست جدید باید پس از آخرین سیاست باشد.");
    if (previous)
      await tx.chargePolicy.update({
        where: { id: previous.id },
        data: { endsAt: startsAt },
      });
    const policy = await tx.chargePolicy.create({
      data: {
        amount,
        previousAmount: previous?.amount,
        startsAt,
        reason,
        actorId: actor.id,
      },
    });
    await audit(
      "billing.policy",
      actor.id,
      policy.id,
      {
        previous: previous?.amount.toString() || null,
        amount: amount.toString(),
        reason,
        approvalMinutesId: approvalMinutesId || null,
      },
      tx,
    );
    await queueEvent(
      tx,
      "policy-notification:" + policy.id,
      "COMM_FINANCIAL_EVENT",
      { id: policy.id, event: "POLICY" },
    );
    return policy;
  });
}
export async function generateInvoices(actor: Actor, key: string) {
  manager(actor);
  const bounds = periodBounds(key);
  if (bounds.startsAt > new Date())
    fail("صدور صورتحساب برای ماه آینده مجاز نیست.");
  return db.$transaction(
    async (tx) => {
      await lock(tx, "billing:" + bounds.key);
      await lock(tx, "charge-policy");
      const period = await tx.billingPeriod.upsert({
        where: { key: bounds.key },
        create: bounds,
        update: {},
      });
      const policy = await tx.chargePolicy.findFirst({
        where: {
          startsAt: { lte: bounds.startsAt },
          OR: [{ endsAt: null }, { endsAt: { gt: bounds.startsAt } }],
        },
      });
      if (!policy) return fail("برای شروع این ماه سیاست شارژ وجود ندارد.");
      const units = await tx.unit.findMany({
        where: { active: true },
        orderBy: { number: "asc" },
      });
      if (!units.length) fail("واحد فعالی ثبت نشده است.");
      let created = 0;
      for (const unit of units) {
        if (
          await tx.invoice.findUnique({
            where: {
              unitId_periodId: { unitId: unit.id, periodId: period.id },
            },
          })
        )
          continue;
        await lock(tx, unit.id);
        const responsibility = await tx.billingResponsibility.findFirst({
          where: {
            unitId: unit.id,
            startsAt: { lte: bounds.startsAt },
            OR: [{ endsAt: null }, { endsAt: { gt: bounds.startsAt } }],
          },
          include: { user: true },
        });
        if (!responsibility)
          return fail(
            `واحد ${unit.number}: مسئول مالی در ابتدای ماه تعیین نشده است.`,
          );
        const invoice = await tx.invoice.create({
          data: {
            unitId: unit.id,
            unitNumber: unit.number,
            periodId: period.id,
            policyId: policy.id,
            responsibilityId: responsibility.id,
            responsibleId: responsibility.userId,
            responsibleName: responsibility.user.name || "عضو ساختمان",
            amount: policy.amount,
            actorId: actor.id,
            items: {
              create: {
                description: "شارژ ماهانه ساختمان",
                amount: policy.amount,
              },
            },
          },
        });
        await post(
          tx,
          actor.id,
          "invoice:" + invoice.id,
          "صدور شارژ " + key,
          bounds.startsAt,
          pair("AR", "REVENUE", invoice.amount),
        );
        await audit("billing.issue", actor.id, invoice.id, { period: key }, tx);
        await queueEvent(
          tx,
          "invoice-notification:" + invoice.id,
          "COMM_FINANCIAL_EVENT",
          { id: invoice.id, event: "INVOICE" },
        );
        created++;
      }
      await tx.outboxJob.upsert({
        where: { key: "billing-issued:" + key },
        create: {
          key: "billing-issued:" + key,
          kind: "NOTIFICATION_EVENT",
          payload: { period: key },
        },
        update: {},
      });
      return { period, created };
    },
    { timeout: 20000 },
  );
}
export async function cancelInvoice(
  actor: Actor,
  id: string,
  rawReason: string,
) {
  manager(actor);
  const reason = reasonSchema.parse(rawReason);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${id}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
    if (invoice.status === "CANCELLED") return invoice;
    const corrections = await tx.invoiceCorrection.findMany({
      where: { invoiceId: id },
    });
    for (const correction of corrections) {
      const correctionEntry = await tx.journalEntry.findUniqueOrThrow({
        where: { source: "correction:" + correction.id },
      });
      await reverse(
        tx,
        actor.id,
        correctionEntry.id,
        "correction-cancel:" + correction.id,
        reason,
      );
    }
    const entry = await tx.journalEntry.findUniqueOrThrow({
      where: { source: "invoice:" + id },
    });
    await reverse(tx, actor.id, entry.id, "invoice-cancel:" + id, reason);
    const updated = await tx.invoice.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });
    await audit("billing.cancel", actor.id, id, { reason }, tx);
    return updated;
  });
}

export async function correctInvoice(
  actor: Actor,
  id: string,
  amount: bigint,
  rawReason: string,
  requestKey: string,
) {
  manager(actor);
  const reason = reasonSchema.parse(rawReason);
  if (
    amount === 0n ||
    amount > 9223372036854775807n ||
    amount < -9223372036854775807n ||
    !requestKey ||
    requestKey.length > 100
  )
    fail("اصلاحیه معتبر نیست.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${id}::uuid FOR UPDATE`;
    const previous = await tx.invoiceCorrection.findUnique({
      where: { requestKey },
    });
    if (previous) {
      if (
        previous.invoiceId !== id ||
        previous.amount !== amount ||
        previous.reason !== reason
      )
        fail("کلید تکرار با درخواست متفاوت است.");
      return previous;
    }
    const correction = await tx.invoiceCorrection.create({
      data: { invoiceId: id, amount, reason, actorId: actor.id, requestKey },
    });
    await post(
      tx,
      actor.id,
      "correction:" + correction.id,
      reason,
      new Date(),
      amount > 0n
        ? pair("AR", "REVENUE", amount)
        : pair("REVENUE", "AR", -amount),
    );
    await audit(
      "billing.correct",
      actor.id,
      correction.id,
      { reason, amount: amount.toString() },
      tx,
    );
    return correction;
  });
}
export function invoiceTotal(invoice: {
  amount: bigint;
  corrections: { amount: bigint }[];
}) {
  return invoice.corrections.reduce((a, c) => a + c.amount, invoice.amount);
}
