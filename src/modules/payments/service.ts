import { invoiceTotal } from "@/modules/billing/service";
import { db } from "@/lib/db";
import { canManage, fail, type Actor } from "@/lib/security/core";
import {
  member,
  lock,
  post,
  pair,
  manager,
} from "@/modules/accounting/service";
import { audit } from "@/modules/audit/service";
import {
  paymentProvider,
  mockEnabled,
  type VerifyPaymentResult,
} from "./providers";
export async function accessibleInvoice(actor: Actor, id: string) {
  await member(actor);
  const invoice = await db.invoice.findUniqueOrThrow({
    where: { id },
    include: { items: true, allocations: true, corrections: true },
  });
  if (!canManage(actor) && invoice.responsibleId !== actor.id)
    fail("دسترسی به این صورتحساب مجاز نیست.");
  return invoice;
}
export async function startPayment(actor: Actor, invoiceId: string) {
  await accessibleInvoice(actor, invoiceId);
  const provider = paymentProvider();
  if (provider.name === "unconfigured")
    fail("درگاه پرداخت واقعی پیکربندی نشده است؛ پرداخت آنلاین در دسترس نیست.");
  const intent = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${invoiceId}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { allocations: true, corrections: true },
    });
    if (invoice.status !== "ISSUED") fail("صورتحساب لغو شده است.");
    const amount =
      invoiceTotal(invoice) -
      invoice.allocations.reduce((a, p) => a + p.amount, 0n);
    if (amount <= 0n) fail("این صورتحساب تسویه شده است.");
    const previous = await tx.paymentIntent.findFirst({
      where: { invoiceId, status: { in: ["CREATING", "PENDING", "RETRY"] } },
    });
    return (
      previous ||
      tx.paymentIntent.create({
        data: { invoiceId, actorId: actor.id, provider: provider.name, amount },
      })
    );
  });
  const selected = paymentProvider(intent.provider);
  const result = await selected.createPayment({
    intentId: intent.id,
    amount: intent.amount,
    callbackUrl: process.env.APP_ORIGIN + "/api/payments/callback",
  });
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${invoiceId}::uuid FOR UPDATE`;
    const current = await tx.paymentIntent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    if (current.status === "CREATING")
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { authority: result.authority, status: "PENDING" },
      });
    await audit("payment.intent", actor.id, intent.id, {}, tx);
  });
  return { intentId: intent.id, paymentUrl: result.paymentUrl };
}
export async function verifyPayment(authority: string) {
  const initial = await db.paymentIntent.findUniqueOrThrow({
    where: { authority },
  });
  if (initial.status === "VERIFIED") return initial;
  const provider = paymentProvider(initial.provider);
  let result: VerifyPaymentResult;
  try {
    result = await provider.verifyPayment({
      authority,
      amount: initial.amount,
    });
  } catch {
    await db.paymentIntent.updateMany({
      where: { id: initial.id, status: { in: ["PENDING", "RETRY"] } },
      data: { status: "RETRY" },
    });
    await db.outboxJob.upsert({
      where: { key: "verify:" + initial.id },
      create: {
        key: "verify:" + initial.id,
        kind: "VERIFY_PAYMENT",
        payload: { authority },
      },
      update: { status: "PENDING", availableAt: new Date(Date.now() + 30000) },
    });
    await audit("payment.verify-retry", null, initial.id);
    return fail("تأیید پرداخت انجام نشد؛ وضعیت پرداخت را دوباره بررسی کنید.");
  }
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${initial.invoiceId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "PaymentIntent" WHERE id=${initial.id}::uuid FOR UPDATE`;
    const intent = await tx.paymentIntent.findUniqueOrThrow({
      where: { id: initial.id },
    });
    if (["VERIFIED", "FAILED", "CANCELLED"].includes(intent.status))
      return intent;
    if (result.status === "PENDING") {
      await tx.outboxJob.upsert({
        where: { key: "verify:" + intent.id },
        create: {
          key: "verify:" + intent.id,
          kind: "VERIFY_PAYMENT",
          payload: { authority },
          availableAt: new Date(Date.now() + 30000),
        },
        update: {
          status: "PENDING",
          availableAt: new Date(Date.now() + 30000),
        },
      });
      return intent;
    }
    if (result.status !== "VERIFIED") {
      const failed = await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { status: result.status },
      });
      await audit(
        "payment." + result.status.toLowerCase(),
        null,
        intent.id,
        {},
        tx,
      );
      return failed;
    }
    if (
      result.amount !== intent.amount ||
      result.currency !== "IRR" ||
      !result.transactionId
    )
      fail("تأیید مبلغ و شناسه تراکنش نامعتبر است.");
    const verified = await tx.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        providerTransactionId: result.transactionId,
      },
    });
    await tx.paymentAllocation.create({
      data: {
        intentId: intent.id,
        invoiceId: intent.invoiceId,
        amount: result.amount,
      },
    });
    await post(
      tx,
      intent.actorId,
      "payment:" + intent.id,
      "پرداخت تأییدشده شارژ",
      new Date(),
      pair("CLEARING", "AR", result.amount),
    );
    await audit(
      "payment.verified",
      intent.actorId,
      intent.id,
      { amount: result.amount.toString() },
      tx,
    );
    await tx.outboxJob.upsert({
      where: { key: "receipt:" + intent.id },
      create: {
        key: "receipt:" + intent.id,
        kind: "NOTIFICATION_EVENT",
        payload: { intentId: intent.id },
      },
      update: {},
    });
    return verified;
  });
}
export async function simulatePayment(
  actor: Actor,
  authority: string,
  outcome: string,
) {
  if (!mockEnabled()) fail("درگاه آزمایشی غیرفعال است.");
  const intent = await db.paymentIntent.findUniqueOrThrow({
    where: { authority },
  });
  await accessibleInvoice(actor, intent.invoiceId);
  if (
    !["SUCCESS", "FAILED", "CANCELLED", "DELAYED", "VERIFY_FAILURE"].includes(
      outcome,
    )
  )
    fail("نتیجه آزمایش معتبر نیست.");
  await db.$transaction(async (tx) => {
    await lock(tx, "mock:" + authority);
    const mock = await tx.mockPayment.findUniqueOrThrow({
      where: { authority },
    });
    if (mock.outcome !== "WAITING" && mock.outcome !== "VERIFY_FAILURE") return;
    await tx.mockPayment.update({
      where: { authority },
      data: {
        outcome,
        availableAt:
          outcome === "DELAYED" ? new Date(Date.now() + 30000) : new Date(),
      },
    });
  });
  return verifyPayment(authority);
}
export async function reconcile(
  actor: Actor,
  intentId: string,
  financialAccountId: string,
  fee: bigint,
  reference: string,
) {
  manager(actor);
  if (fee < 0n || reference.trim().length < 3 || reference.length > 200)
    fail("کارمزد و مرجع تسویه معتبر نیست.");
  return db.$transaction(async (tx) => {
    await lock(tx, "bank");
    await lock(tx, "settlement:" + intentId);
    const previous = await tx.reconciliation.findUnique({
      where: { intentId },
    });
    if (previous) {
      if (
        previous.financialAccountId !== financialAccountId ||
        previous.fee !== fee ||
        previous.reference !== reference
      )
        fail("تسویه قبلی با مشخصات متفاوت ثبت شده است.");
      return previous;
    }
    const intent = await tx.paymentIntent.findUniqueOrThrow({
      where: { id: intentId },
    });
    if (
      intent.status !== "VERIFIED" ||
      intent.provider === "manual" ||
      fee >= intent.amount
    )
      fail("پرداخت تأییدشده و کارمزد معتبر لازم است.");
    const account = await tx.financialAccount.findUniqueOrThrow({
      where: { id: financialAccountId },
    });
    const record = await tx.reconciliation.create({
      data: {
        intentId,
        financialAccountId,
        amount: intent.amount,
        fee,
        reference,
        settledAt: new Date(),
        actorId: actor.id,
      },
    });
    const lines = [
      {
        accountCode: account.accountCode,
        debit: intent.amount - fee,
        credit: 0n,
      },
      { accountCode: "CLEARING", debit: 0n, credit: intent.amount },
    ];
    if (fee) lines.push({ accountCode: "FEES", debit: fee, credit: 0n });
    await post(
      tx,
      actor.id,
      "settlement:" + record.id,
      "تسویه با سند بانکی: " + reference,
      record.settledAt,
      lines,
    );
    await audit(
      "payment.settlement",
      actor.id,
      record.id,
      { reference, fee: fee.toString() },
      tx,
    );
    return record;
  });
}
