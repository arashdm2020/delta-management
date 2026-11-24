import { db } from "@/lib/db";
import { type Actor, fail } from "@/lib/security/core";
import { manager, lock, post, pair, balance, reverse } from "./service";
import { audit } from "@/modules/audit/service";
import { z } from "zod";
export async function recordIncome(
  actor: Actor,
  input: {
    financialAccountId: string;
    amount: bigint;
    description: string;
    payer: string;
    reference: string;
    occurredAt: Date;
  },
) {
  manager(actor);
  z.object({
    financialAccountId: z.uuid(),
    amount: z.bigint().positive().max(9223372036854775807n),
    description: z.string().trim().min(3).max(500),
    payer: z.string().trim().min(2).max(200),
    reference: z.string().trim().min(3).max(200),
    occurredAt: z.date().max(new Date()),
  }).parse(input);
  return db.$transaction(async (tx) => {
    await lock(tx, "bank");
    const account = await tx.financialAccount.findUniqueOrThrow({
      where: { id: input.financialAccountId },
    });
    const income = await tx.income.create({
      data: { ...input, actorId: actor.id },
    });
    await post(
      tx,
      actor.id,
      "income:" + income.id,
      input.description,
      input.occurredAt,
      pair(account.accountCode, "OTHER_REVENUE", input.amount),
    );
    await audit(
      "income.post",
      actor.id,
      income.id,
      { reference: input.reference },
      tx,
    );
    return income;
  });
}
export async function reverseIncome(actor: Actor, id: string, reason: string) {
  manager(actor);
  if (reason.trim().length < 3 || reason.length > 500)
    fail("دلیل برگشت لازم است.");
  return db.$transaction(async (tx) => {
    await lock(tx, "bank");
    const income = await tx.income.findUniqueOrThrow({ where: { id } });
    if (income.status === "REVERSED") return income;
    const account = await tx.financialAccount.findUniqueOrThrow({
      where: { id: income.financialAccountId },
    });
    if ((await balance(tx, account.accountCode)) < income.amount)
      fail("مانده بانک برای برگشت کافی نیست.");
    const entry = await tx.journalEntry.findUniqueOrThrow({
      where: { source: "income:" + id },
    });
    await reverse(tx, actor.id, entry.id, "income-reverse:" + id, reason);
    const reversed = await tx.income.update({
      where: { id },
      data: { status: "REVERSED" },
    });
    await audit("income.reverse", actor.id, id, { reason }, tx);
    return reversed;
  });
}
