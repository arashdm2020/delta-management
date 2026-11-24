import { validateAttachment } from "@/modules/attachments/service";
import { db } from "@/lib/db";
import { type Actor, fail } from "@/lib/security/core";
import {
  manager,
  lock,
  post,
  pair,
  balance,
  reverse,
} from "@/modules/accounting/service";
import { audit } from "@/modules/audit/service";
import { z } from "zod";
export async function createExpense(
  actor: Actor,
  input: {
    categoryId: string;
    description: string;
    payee: string;
    amount: bigint;
    occurredAt: Date;
  },
  document?: { name: string; mime: string; content: Uint8Array },
) {
  manager(actor);
  z.object({
    categoryId: z.uuid(),
    description: z.string().trim().min(3).max(500),
    payee: z.string().trim().min(2).max(200),
    amount: z.bigint().positive().max(9223372036854775807n),
    occurredAt: z.date().max(new Date()),
  }).parse(input);
  if (document) validateAttachment(document);
  return db.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: { ...input, actorId: actor.id },
    });
    if (document)
      await tx.expenseDocument.create({
        data: {
          expenseId: expense.id,
          ...document,
          content: new Uint8Array(document.content),
        },
      });
    await audit("expense.create", actor.id, expense.id, {}, tx);
    return expense;
  });
}
export async function postExpense(actor: Actor, id: string) {
  manager(actor);
  return db.$transaction(async (tx) => {
    await lock(tx, "expense:" + id);
    const expense = await tx.expense.findUniqueOrThrow({ where: { id } });
    if (expense.status !== "DRAFT") return expense;
    await post(
      tx,
      actor.id,
      "expense:" + id,
      expense.description,
      expense.occurredAt,
      pair("EXPENSE", "AP", expense.amount),
    );
    const posted = await tx.expense.update({
      where: { id },
      data: { status: "POSTED" },
    });
    await audit("expense.post", actor.id, id, {}, tx);
    return posted;
  });
}
export async function payExpense(
  actor: Actor,
  id: string,
  financialAccountId: string,
) {
  manager(actor);
  return db.$transaction(async (tx) => {
    await lock(tx, "bank");
    await lock(tx, "expense:" + id);
    const expense = await tx.expense.findUniqueOrThrow({ where: { id } });
    if (expense.status === "PAID") return expense;
    if (expense.status !== "POSTED") fail("ابتدا هزینه را ثبت قطعی کنید.");
    const account = await tx.financialAccount.findUniqueOrThrow({
      where: { id: financialAccountId },
    });
    if ((await balance(tx, account.accountCode)) < expense.amount)
      fail("مانده بانک برای پرداخت کافی نیست.");
    await post(
      tx,
      actor.id,
      "expense-pay:" + id,
      "پرداخت: " + expense.description,
      new Date(),
      pair("AP", account.accountCode, expense.amount),
    );
    const paid = await tx.expense.update({
      where: { id },
      data: { status: "PAID" },
    });
    await audit("expense.pay", actor.id, id, {}, tx);
    return paid;
  });
}
export async function reverseExpense(actor: Actor, id: string, reason: string) {
  manager(actor);
  if (reason.trim().length < 3 || reason.length > 500)
    fail("دلیل برگشت را وارد کنید.");
  return db.$transaction(async (tx) => {
    await lock(tx, "bank");
    await lock(tx, "expense:" + id);
    const expense = await tx.expense.findUniqueOrThrow({ where: { id } });
    if (expense.status === "REVERSED") return expense;
    if (!["POSTED", "PAID"].includes(expense.status))
      fail("هزینه هنوز قطعی نشده است.");
    for (const source of ["expense-pay:", "expense:"]) {
      const entry = await tx.journalEntry.findUnique({
        where: { source: source + id },
      });
      if (entry)
        await reverse(tx, actor.id, entry.id, "reverse:" + entry.id, reason);
    }
    const reversed = await tx.expense.update({
      where: { id },
      data: { status: "REVERSED" },
    });
    await audit("expense.reverse", actor.id, id, { reason }, tx);
    return reversed;
  });
}
