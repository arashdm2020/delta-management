import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/security/core";
export type CreatePaymentInput = {
  intentId: string;
  amount: bigint;
  callbackUrl: string;
};
export type CreatePaymentResult = { authority: string; paymentUrl: string };
export type VerifyPaymentResult =
  | {
      status: "VERIFIED";
      amount: bigint;
      currency: "IRR";
      transactionId: string;
    }
  | { status: "FAILED" | "CANCELLED" | "PENDING" };
export interface PaymentProvider {
  name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(input: {
    authority: string;
    amount: bigint;
  }): Promise<VerifyPaymentResult>;
}
export function mockEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.PAYMENT_PROVIDER === "mock"
  );
}
function guard() {
  if (!mockEnabled())
    throw new DomainError(
      "GATEWAY",
      "درگاه آزمایشی فقط در محیط توسعه فعال است.",
    );
}
export class DevelopmentMockProvider implements PaymentProvider {
  name = "mock";
  async createPayment(input: CreatePaymentInput) {
    guard();
    const payment = await db.mockPayment.upsert({
      where: { intentId: input.intentId },
      create: {
        intentId: input.intentId,
        authority: randomUUID(),
        transactionId: "mock-" + randomUUID(),
        amount: input.amount,
      },
      update: {},
    });
    return {
      authority: payment.authority,
      paymentUrl: "/payments/mock/" + payment.authority,
    };
  }
  async verifyPayment(input: {
    authority: string;
    amount: bigint;
  }): Promise<VerifyPaymentResult> {
    guard();
    const payment = await db.mockPayment.findUniqueOrThrow({
      where: { authority: input.authority },
    });
    if (payment.amount !== input.amount)
      throw new DomainError("VERIFY", "مبلغ تأییدشده مطابقت ندارد.");
    if (payment.outcome === "VERIFY_FAILURE")
      throw new DomainError(
        "VERIFY",
        "تأیید درگاه در دسترس نیست؛ دوباره بررسی کنید.",
      );
    if (
      payment.outcome === "WAITING" ||
      (payment.outcome === "DELAYED" &&
        (!payment.availableAt || payment.availableAt > new Date()))
    )
      return { status: "PENDING" };
    if (payment.outcome === "FAILED" || payment.outcome === "CANCELLED")
      return { status: payment.outcome };
    return {
      status: "VERIFIED",
      amount: payment.amount,
      currency: "IRR",
      transactionId: payment.transactionId,
    };
  }
}
// Contract boundary only. A documented provider and credentials must be selected before implementation.
class UnconfiguredGateway implements PaymentProvider {
  name = "unconfigured";
  async createPayment(): Promise<CreatePaymentResult> {
    throw new DomainError(
      "GATEWAY",
      "درگاه پرداخت واقعی پیکربندی نشده است؛ پرداخت آنلاین در دسترس نیست.",
    );
  }
  async verifyPayment(): Promise<VerifyPaymentResult> {
    throw new DomainError("GATEWAY", "درگاه پرداخت واقعی پیکربندی نشده است.");
  }
}
export function paymentProvider(
  name = process.env.PAYMENT_PROVIDER,
): PaymentProvider {
  if (name === "mock") {
    guard();
    return new DevelopmentMockProvider();
  }
  return new UnconfiguredGateway();
}
