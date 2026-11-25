import { hashToken } from "@/lib/security/core";
import { db } from "@/lib/db";
import { manager, lock, pair, post } from "@/modules/accounting/service";
import { audit } from "@/modules/audit/service";
import { fail, type Actor } from "@/lib/security/core";
import { invoiceTotal } from "@/modules/billing/service";
import { reasonSchema } from "@/modules/billing/schemas";

export async function recordInvoicePayment(
  actor: Actor,
  input: {
    id: string;
    invoiceId: string;
    financialAccountId: string;
    amount: bigint;
    reason: string;
  },
) {
  manager(actor);
  const { id, invoiceId, financialAccountId, amount } = input;
  const reason = reasonSchema.parse(input.reason);
  if (amount <= 0n || amount > 9223372036854775807n) fail("مبلغ معتبر نیست.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${invoiceId}::uuid FOR UPDATE`;
    await lock(tx, "bank");
    const account = await tx.financialAccount.findUniqueOrThrow({
      where: { id: financialAccountId },
    });
    const existing = await tx.paymentIntent.findUnique({ where: { id } });
    if (existing) {
      const journal = await tx.journalEntry.findUniqueOrThrow({
        where: { source: "payment:" + id },
        include: { lines: true },
      });
      if (
        existing.provider !== "manual" ||
        existing.invoiceId !== invoiceId ||
        existing.amount !== amount ||
        journal.description !== reason ||
        !journal.lines.some(
          (line) =>
            line.accountCode === account.accountCode && line.debit === amount,
        )
      )
        fail("درخواست تکراری با اطلاعات متفاوت است.");
      return existing;
    }
    const providerTransactionId = hashToken(
      JSON.stringify([invoiceId, financialAccountId, reason]),
    );
    if (
      await tx.paymentIntent.findUnique({
        where: {
          provider_providerTransactionId: {
            provider: "manual",
            providerTransactionId,
          },
        },
      })
    )
      fail("این مرجع پرداخت قبلاً برای صورتحساب ثبت شده است.");
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        allocations: true,
        corrections: true,
        intents: {
          where: { status: { in: ["CREATING", "PENDING", "RETRY"] } },
        },
      },
    });
    if (
      invoice.status !== "ISSUED" ||
      invoice.intents.length ||
      amount >
        invoiceTotal(invoice) -
          invoice.allocations.reduce((sum, item) => sum + item.amount, 0n)
    )
      fail("صورتحساب یا مانده معتبر نیست، یا پرداخت درگاه در جریان است.");
    const now = new Date();
    const payment = await tx.paymentIntent.create({
      data: {
        id,
        invoiceId,
        amount,
        provider: "manual",
        providerTransactionId,
        status: "VERIFIED",
        actorId: actor.id,
        verifiedAt: now,
      },
    });
    await tx.paymentAllocation.create({
      data: { invoiceId, intentId: id, amount },
    });
    await post(
      tx,
      actor.id,
      "payment:" + id,
      reason,
      now,
      pair(account.accountCode, "AR", amount),
    );
    await audit(
      "payment.manual",
      actor.id,
      id,
      { invoiceId, financialAccountId, reason },
      tx,
    );
    return payment;
  });
}
