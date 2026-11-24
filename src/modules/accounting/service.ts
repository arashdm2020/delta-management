import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canManage, fail, type Actor } from "@/lib/security/core";
export function manager(actor: Actor) {
  if (!canManage(actor)) fail("دسترسی مدیریت مالی لازم است.");
}
export async function member(actor: Actor, tx: Prisma.TransactionClient = db) {
  if (canManage(actor)) return;
  if (
    actor.status !== "APPROVED" ||
    !(await tx.unitMembership.findFirst({
      where: {
        userId: actor.id,
        startsAt: { lte: new Date() },
        endsAt: null,
        unit: { active: true },
      },
    }))
  )
    fail("عضویت فعال و تأیید حساب لازم است.");
}
export async function lock(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
export type Line = { accountCode: string; debit: bigint; credit: bigint };
export function pair(debit: string, credit: string, amount: bigint): Line[] {
  return [
    { accountCode: debit, debit: amount, credit: 0n },
    { accountCode: credit, debit: 0n, credit: amount },
  ];
}
export async function post(
  tx: Prisma.TransactionClient,
  actorId: string,
  source: string,
  description: string,
  occurredAt: Date,
  lines: Line[],
  reversalOfId?: string,
) {
  await lock(tx, "journal:" + source);
  const previous = await tx.journalEntry.findUnique({ where: { source } });
  if (previous) return previous;
  if (
    lines.length < 2 ||
    lines.some(
      (l) =>
        l.debit < 0n || l.credit < 0n || (l.debit === 0n) === (l.credit === 0n),
    ) ||
    lines.reduce((a, l) => a + l.debit - l.credit, 0n) !== 0n
  )
    fail("سند حسابداری تراز نیست.");
  const entry = await tx.journalEntry.create({
    data: {
      actorId,
      source,
      description,
      occurredAt,
      reversalOfId,
      lines: { create: lines },
    },
  });
  return tx.journalEntry.update({
    where: { id: entry.id },
    data: { status: "POSTED" },
  });
}
export async function reverse(
  tx: Prisma.TransactionClient,
  actorId: string,
  entryId: string,
  source: string,
  reason: string,
) {
  const entry = await tx.journalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { lines: true },
  });
  if (entry.status !== "POSTED" || entry.reversalOfId)
    fail("این سند قابل برگشت نیست.");
  return post(
    tx,
    actorId,
    source,
    reason,
    new Date(),
    entry.lines.map((l) => ({
      accountCode: l.accountCode,
      debit: l.credit,
      credit: l.debit,
    })),
    entry.id,
  );
}
export async function balance(
  tx: Prisma.TransactionClient,
  accountCode: string,
) {
  const total = await tx.journalLine.aggregate({
    where: { accountCode, entry: { status: "POSTED" } },
    _sum: { debit: true, credit: true },
  });
  return (total._sum.debit || 0n) - (total._sum.credit || 0n);
}
export async function openingBalance(
  actor: Actor,
  financialAccountId: string,
  amount: bigint,
  reason: string,
) {
  manager(actor);
  if (amount <= 0n || reason.trim().length < 3) fail("مبلغ و دلیل لازم است.");
  return db.$transaction(async (tx) => {
    await lock(tx, "bank");
    const account = await tx.financialAccount.findUniqueOrThrow({
      where: { id: financialAccountId },
    });
    const record = await tx.openingBalance.create({
      data: {
        financialAccountId,
        amount,
        reason,
        actorId: actor.id,
        occurredAt: new Date(),
      },
    });
    await post(
      tx,
      actor.id,
      "opening:" + record.id,
      reason,
      record.occurredAt,
      pair(account.accountCode, "EQUITY", amount),
    );
    await tx.auditLog.create({
      data: {
        action: "finance.opening",
        actorId: actor.id,
        targetId: record.id,
      },
    });
    return record;
  });
}
