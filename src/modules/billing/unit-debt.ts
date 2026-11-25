import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fail, type Actor } from "@/lib/security/core";
import {
  lock,
  manager,
  pair,
  post,
  reverse,
} from "@/modules/accounting/service";
import { audit } from "@/modules/audit/service";
import { periodBounds } from "./calendar";
import { z } from "zod";

const identifier = z.uuid();
const maxAmount = 9223372036854775807n;
export const debtKind = z.enum(["HISTORICAL", "OPENING", "MISC"]);

export async function recordUnitDebt(
  actor: Actor,
  input: {
    id: string;
    unitId: string;
    kind: z.infer<typeof debtKind>;
    period: string;
    reference: string;
    description: string;
    amount: bigint;
  },
  transaction?: Prisma.TransactionClient,
) {
  manager(actor);
  const id = identifier.parse(input.id);
  const unitId = identifier.parse(input.unitId);
  const kind = debtKind.parse(input.kind);
  const bounds = periodBounds(input.period);
  const reference = z.string().trim().min(3).max(100).parse(input.reference);
  const description = z
    .string()
    .trim()
    .min(3)
    .max(300)
    .parse(input.description);
  const { amount } = input;
  if (amount <= 0n || amount > maxAmount || bounds.startsAt > new Date())
    fail("مبلغ یا دورهٔ بدهی معتبر نیست.");
  const record = async (tx: Prisma.TransactionClient) => {
    await lock(tx, unitId);
    const existing = await tx.unitDebt.findUnique({ where: { id } });
    if (existing) {
      const entry = await tx.journalEntry.findUniqueOrThrow({
        where: { source: "unit-debt:" + id },
        include: { lines: true },
      });
      if (
        existing.unitId !== unitId ||
        existing.kind !== kind ||
        existing.periodKey !== bounds.key ||
        existing.reference !== reference ||
        existing.description !== description ||
        entry.lines.find((line) => line.accountCode === "AR")?.debit !== amount
      )
        fail("درخواست تکراری با اطلاعات متفاوت است.");
      return existing;
    }
    if (kind === "HISTORICAL") {
      const period = await tx.billingPeriod.findUnique({
        where: { key: bounds.key },
      });
      if (
        period &&
        (await tx.invoice.findUnique({
          where: { unitId_periodId: { unitId, periodId: period.id } },
        }))
      )
        fail("شارژ این ماه قبلاً صادر شده است.");
    }
    const debt = await tx.unitDebt.create({
      data: {
        id,
        unitId,
        kind,
        periodKey: bounds.key,
        reference,
        description,
        dueAt: bounds.dueAt,
      },
    });
    await post(
      tx,
      actor.id,
      "unit-debt:" + id,
      description,
      bounds.startsAt,
      pair(
        "AR",
        kind === "OPENING"
          ? "EQUITY"
          : kind === "MISC"
            ? "OTHER_REVENUE"
            : "REVENUE",
        amount,
      ),
    );
    await audit(
      "billing.unit-debt",
      actor.id,
      id,
      { unitId, reference, kind, period: bounds.key },
      tx,
    );
    return debt;
  };
  return transaction ? record(transaction) : db.$transaction(record);
}

export async function unitDebtEntries(
  tx: Prisma.TransactionClient,
  debtId: string,
) {
  return tx.journalEntry.findMany({
    where: {
      status: "POSTED",
      OR: [
        { source: "unit-debt:" + debtId },
        { source: { startsWith: "unit-debt:" + debtId + ":" } },
      ],
    },
    include: { lines: true },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
  });
}

export async function updateUnitDebt(
  actor: Actor,
  input: {
    id: string;
    debtId: string;
    operation: "payment" | "increase" | "decrease" | "reverse";
    reason: string;
    amount?: bigint;
    financialAccountId?: string;
    entryId?: string;
  },
) {
  manager(actor);
  const id = identifier.parse(input.id);
  const debtId = identifier.parse(input.debtId);
  const reason = z.string().trim().min(3).max(500).parse(input.reason);
  const { operation, amount } = input;
  const source = `unit-debt:${debtId}:${operation}:${id}`;
  return db.$transaction(async (tx) => {
    const debt = await tx.unitDebt.findUniqueOrThrow({ where: { id: debtId } });
    await lock(tx, debt.unitId);
    const entries = await unitDebtEntries(tx, debtId);
    const ar = entries
      .flatMap((entry) => entry.lines)
      .filter((line) => line.accountCode === "AR");
    const outstanding = ar.reduce(
      (sum, line) => sum + line.debit - line.credit,
      0n,
    );
    const account =
      operation === "payment"
        ? await tx.financialAccount.findUniqueOrThrow({
            where: { id: identifier.parse(input.financialAccountId) },
          })
        : null;
    const previous = entries.find((entry) => entry.source === source);
    if (previous) {
      const line = previous.lines.find((line) => line.accountCode === "AR")!;
      if (
        previous.description !== reason ||
        (operation !== "reverse" && line.debit + line.credit !== amount) ||
        (operation === "reverse" && previous.reversalOfId !== input.entryId) ||
        (operation === "payment" &&
          !previous.lines.some(
            (item) =>
              item.debit > 0n && item.accountCode === account?.accountCode,
          ))
      )
        fail("درخواست تکراری با اطلاعات متفاوت است.");
      return previous;
    }
    if (
      operation === "payment" &&
      entries.some(
        (entry) =>
          entry.source.split(":")[2] === "payment" &&
          entry.description === reason,
      )
    )
      fail("این مرجع پرداخت قبلاً برای بدهی ثبت شده است.");
    let entry;
    if (operation === "reverse") {
      const original = entries.find((item) => item.id === input.entryId);
      if (
        !original ||
        original.reversalOfId ||
        entries.some((item) => item.reversalOfId === original.id)
      )
        return fail("سند قابل برگشت نیست.");
      const delta = original.lines
        .filter((line) => line.accountCode === "AR")
        .reduce((sum, line) => sum + line.debit - line.credit, 0n);
      if (outstanding - delta < 0n)
        fail("ابتدا پرداخت‌های مرتبط را اصلاح کنید.");
      if (original.source.split(":")[2] === "payment") await lock(tx, "bank");
      entry = await reverse(tx, actor.id, original.id, source, reason);
    } else {
      if (
        amount === undefined ||
        amount <= 0n ||
        amount > maxAmount ||
        (operation !== "increase" && amount > outstanding)
      )
        return fail("مبلغ از مانده بیشتر است یا معتبر نیست.");
      const revenue =
        debt.kind === "OPENING"
          ? "EQUITY"
          : debt.kind === "MISC"
            ? "OTHER_REVENUE"
            : "REVENUE";
      if (account) await lock(tx, "bank");
      entry = await post(
        tx,
        actor.id,
        source,
        reason,
        new Date(),
        operation === "increase"
          ? pair("AR", revenue, amount)
          : pair(account?.accountCode ?? revenue, "AR", amount),
      );
    }
    await audit(
      "billing.unit-debt." + operation,
      actor.id,
      debtId,
      { entryId: entry.id, reason },
      tx,
    );
    return entry;
  });
}
