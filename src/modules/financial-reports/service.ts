import {
  receivableEntries,
  summarizeReceivables,
} from "@/modules/accounting/receivables";
import { db } from "@/lib/db";
import { type Actor, canManage } from "@/lib/security/core";
import { member, manager, balance } from "@/modules/accounting/service";
import { currentPeriod, periodBounds } from "@/modules/billing/calendar";
import { invoiceTotal } from "@/modules/billing/service";
export function invoiceState(invoice: {
  status: string;
  amount: bigint;
  corrections: { amount: bigint }[];
  allocations: { amount: bigint }[];
}) {
  const amount = invoiceTotal(invoice);
  const paid = invoice.allocations.reduce((a, p) => a + p.amount, 0n);
  const outstanding = invoice.status === "CANCELLED" ? 0n : amount - paid;
  return {
    amount,
    paid,
    outstanding,
    status:
      invoice.status === "CANCELLED"
        ? "لغوشده"
        : outstanding === 0n
          ? "پرداخت‌شده"
          : paid > 0n
            ? "پرداخت جزئی"
            : "پرداخت‌نشده",
  };
}
export async function myInvoices(actor: Actor) {
  await member(actor);
  return db.invoice.findMany({
    where: { responsibleId: actor.id },
    include: { items: true, corrections: true, allocations: true },
    orderBy: { issuedAt: "desc" },
  });
}
export async function unitStatus(actor: Actor, key = currentPeriod()) {
  await member(actor);
  const period = await db.billingPeriod.findUnique({ where: { key } });
  if (!period) return [];
  const invoices = await db.invoice.findMany({
    where: { periodId: period.id },
    include: { corrections: true, allocations: true },
    orderBy: { unitNumber: "asc" },
  });
  // Deliberate DTO: no identities, gateway references, invoice IDs or bank details.
  return invoices.map((i) => ({
    unitNumber: i.unitNumber,
    period: key,
    ...invoiceState(i),
  }));
}
export async function receipts(actor: Actor) {
  await member(actor);
  return db.paymentIntent.findMany({
    where: { status: "VERIFIED", invoice: { responsibleId: actor.id } },
    select: {
      id: true,
      amount: true,
      verifiedAt: true,
      invoice: { select: { unitNumber: true } },
    },
    orderBy: { verifiedAt: "desc" },
  });
}
export async function receipt(actor: Actor, id: string) {
  await member(actor);
  const payment = await db.paymentIntent.findUniqueOrThrow({
    where: { id },
    include: { invoice: true },
  });
  if (!canManage(actor) && payment.invoice.responsibleId !== actor.id)
    throw new Error("دسترسی مجاز نیست.");
  const period = await db.billingPeriod.findUniqueOrThrow({
    where: { id: payment.invoice.periodId },
  });
  return {
    id: payment.id,
    amount: payment.amount,
    verifiedAt: payment.verifiedAt,
    status: payment.status,
    invoiceId: payment.invoiceId,
    unitNumber: payment.invoice.unitNumber,
    period: period.key,
  };
}
export async function dashboard(actor: Actor, key = currentPeriod()) {
  manager(actor);
  return db.$transaction(
    async (tx) => {
      const bounds = periodBounds(key);
      const period = await tx.billingPeriod.findUnique({ where: { key } });
      const invoices = period
        ? await tx.invoice.findMany({
            where: { periodId: period.id },
            include: { corrections: true, allocations: true },
          })
        : [];
      const issued = invoices
        .filter((i) => i.status !== "CANCELLED")
        .reduce((a, i) => a + invoiceTotal(i), 0n);
      const posted = summarizeReceivables(
        await receivableEntries(tx),
        bounds.startsAt,
        bounds.endsAt,
        new Date(),
      );
      const collected = posted.monthlyCollections;
      const receivables = posted.outstanding;
      const expenses = await tx.journalLine.aggregate({
        where: {
          accountCode: { in: ["EXPENSE", "FEES"] },
          entry: {
            status: "POSTED",
            occurredAt: { gte: bounds.startsAt, lt: bounds.endsAt },
          },
        },
        _sum: { debit: true, credit: true },
      });
      const expenseAmount =
        (expenses?._sum.debit || 0n) - (expenses?._sum.credit || 0n);
      const revenue = await tx.journalLine.aggregate({
        where: {
          accountCode: { in: ["REVENUE", "OTHER_REVENUE"] },
          entry: {
            status: "POSTED",
            occurredAt: { gte: bounds.startsAt, lt: bounds.endsAt },
          },
        },
        _sum: { debit: true, credit: true },
      });
      const earned = (revenue?._sum.credit || 0n) - (revenue?._sum.debit || 0n);
      const journals = await tx.journalEntry.findMany({
        where: { status: "POSTED" },
        include: { lines: { include: { account: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      });
      const accounts = await tx.account.findMany({ orderBy: { code: "asc" } });
      const trial = await Promise.all(
        accounts.map(async (account) => ({
          ...account,
          balance: await balance(tx, account.code),
        })),
      );
      return {
        key,
        issued,
        collected,
        receivables,
        expenses: expenseAmount,
        net: earned - expenseAmount,
        bank: await balance(tx, "BANK"),
        clearing: await balance(tx, "CLEARING"),
        payable: -(await balance(tx, "AP")),
        journals,
        trial,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function buildingSummary(actor: Actor, key = currentPeriod()) {
  await member(actor);
  const bounds = periodBounds(key);
  const lines = await db.journalLine.groupBy({
    by: ["accountCode"],
    where: {
      accountCode: { in: ["REVENUE", "OTHER_REVENUE", "EXPENSE", "FEES"] },
      entry: {
        status: "POSTED",
        occurredAt: { gte: bounds.startsAt, lt: bounds.endsAt },
      },
    },
    _sum: { debit: true, credit: true },
  });
  return {
    expenses: lines
      .filter((l) => ["EXPENSE", "FEES"].includes(l.accountCode))
      .reduce((a, l) => a + (l._sum.debit || 0n) - (l._sum.credit || 0n), 0n),
    revenue: lines
      .filter((l) => ["REVENUE", "OTHER_REVENUE"].includes(l.accountCode))
      .reduce((a, l) => a + (l._sum.credit || 0n) - (l._sum.debit || 0n), 0n),
  };
}

export async function paymentRecords(actor: Actor) {
  manager(actor);
  const payments = await db.paymentIntent.findMany({
    include: {
      invoice: { select: { unitNumber: true, responsibleName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const settlements = await db.reconciliation.findMany({
    orderBy: { settledAt: "desc" },
    take: 200,
  });
  return payments.map((payment) => ({
    ...payment,
    settlement: settlements.find((s) => s.intentId === payment.id),
  }));
}

/** Public building DTO for approved members: amounts and unit numbers only. */
export async function unitDebtStatus(actor: Actor) {
  await member(actor);
  const periods = await db.billingPeriod.findMany({
    where: { key: { lte: currentPeriod() } },
    select: { id: true, key: true },
  });
  const periodKeys = new Map(periods.map((p) => [p.id, p.key]));
  const invoices = await db.invoice.findMany({
    where: { status: "ISSUED", periodId: { in: periods.map((p) => p.id) } },
    include: {
      corrections: true,
      allocations: true,
    },
  });
  const grouped = new Map<
    string,
    {
      unitNumber: string;
      amount: bigint;
      paid: bigint;
      outstanding: bigint;
      unpaidMonths: string[];
    }
  >();
  for (const invoice of invoices) {
    const state = invoiceState(invoice);
    const row = grouped.get(invoice.unitNumber) || {
      unitNumber: invoice.unitNumber,
      amount: 0n,
      paid: 0n,
      outstanding: 0n,
      unpaidMonths: [],
    };
    row.amount += state.amount;
    row.paid += state.paid;
    row.outstanding += state.outstanding;
    if (state.outstanding > 0n)
      row.unpaidMonths.push(periodKeys.get(invoice.periodId)!);
    grouped.set(invoice.unitNumber, row);
  }
  return [...grouped.values()]
    .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, "fa"))
    .map((row) => ({
      ...row,
      unpaidMonths: [...new Set(row.unpaidMonths)].sort(),
      status: row.outstanding > 0n ? "بدهکار" : "تسویه‌شده",
    }));
}
