"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApproved } from "@/modules/auth/session";
import { assertOrigin } from "@/modules/auth/http";
import { DomainError } from "@/lib/security/core";
import { db } from "@/lib/db";
import {
  createPolicy,
  generateInvoices,
  cancelInvoice,
  correctInvoice,
} from "./service";
import {
  startPayment,
  simulatePayment,
  verifyPayment,
  accessibleInvoice,
  reconcile,
} from "@/modules/payments/service";
import {
  createExpense,
  postExpense,
  payExpense,
  reverseExpense,
} from "@/modules/expenses/service";
import { recordIncome, reverseIncome } from "@/modules/accounting/income";
import { openingBalance } from "@/modules/accounting/service";
import { parseJalaliDate } from "./calendar";
import { queueBilling } from "./jobs";
import { tomanSchema, reasonSchema, normalizeDigits } from "./schemas";
export type FinanceResult = { ok: boolean; message: string };
export async function financeAction(
  _previous: FinanceResult,
  form: FormData,
): Promise<FinanceResult> {
  const actor = await requireApproved();
  await assertOrigin();
  let destination = "";
  const value = (key: string) => String(form.get(key) || "");
  const id = (key = "id") => z.uuid().parse(value(key));
  try {
    switch (value("operation")) {
      case "policy":
        await createPolicy(
          actor,
          tomanSchema.parse(value("amount")),
          value("period"),
          value("reason"),
          value("approvalMinutesId") || undefined,
        );
        break;
      case "generate":
        await generateInvoices(actor, value("period"));
        break;
      case "queue":
        await queueBilling(actor, value("period"));
        break;
      case "cancel":
        await cancelInvoice(actor, id(), value("reason"));
        break;
      case "correct": {
        const amount = tomanSchema.parse(value("amount"));
        await correctInvoice(
          actor,
          id(),
          value("direction") === "credit" ? -amount : amount,
          value("reason"),
          id("requestKey"),
        );
        break;
      }
      case "pay":
        destination = (await startPayment(actor, id())).paymentUrl;
        break;
      case "retry": {
        const intent = await db.paymentIntent.findUniqueOrThrow({
          where: { id: id() },
        });
        await accessibleInvoice(actor, intent.invoiceId);
        if (intent.authority) await verifyPayment(intent.authority);
        destination = "/payments/receipt/" + intent.id;
        break;
      }
      case "mock": {
        const intent = await simulatePayment(
          actor,
          z.string().min(1).max(200).parse(value("authority")),
          value("outcome"),
        );
        destination = "/payments/receipt/" + intent.id;
        break;
      }
      case "expense": {
        const file = form.get("document");
        if (file instanceof File && file.size > 2097152)
          throw new DomainError("FILE", "پیوست باید حداکثر دو مگابایت باشد.");
        const document =
          file instanceof File && file.size
            ? {
                name: file.name,
                mime: file.type,
                content: new Uint8Array(await file.arrayBuffer()),
              }
            : undefined;
        await createExpense(
          actor,
          {
            categoryId: id("categoryId"),
            description: value("description"),
            payee: value("payee"),
            amount: tomanSchema.parse(value("amount")),
            occurredAt: parseJalaliDate(value("date")),
          },
          document,
        );
        break;
      }
      case "expense-post":
        await postExpense(actor, id());
        break;
      case "expense-pay":
        await payExpense(actor, id(), id("financialAccountId"));
        break;
      case "expense-reverse":
        await reverseExpense(actor, id(), value("reason"));
        break;
      case "income":
        await recordIncome(actor, {
          financialAccountId: id("financialAccountId"),
          amount: tomanSchema.parse(value("amount")),
          description: value("description"),
          payer: value("payer"),
          reference: value("reference"),
          occurredAt: parseJalaliDate(value("date")),
        });
        break;
      case "income-reverse":
        await reverseIncome(actor, id(), value("reason"));
        break;
      case "opening":
        await openingBalance(
          actor,
          id("financialAccountId"),
          tomanSchema.parse(value("amount")),
          reasonSchema.parse(value("reason")),
        );
        break;
      case "settle": {
        const fee = z
          .string()
          .regex(/^\d{1,18}$/)
          .parse(normalizeDigits(value("fee")));
        await reconcile(
          actor,
          id(),
          id("financialAccountId"),
          BigInt(fee) * 10n,
          value("reference"),
        );
        break;
      }
      default:
        throw new DomainError("FORM", "عملیات مالی معتبر نیست.");
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof DomainError
          ? error.message
          : error instanceof z.ZodError
            ? "اطلاعات فرم معتبر نیست؛ مبلغ و تاریخ را بررسی کنید."
            : "عملیات ثبت نشد؛ تداخل سوابق یا وضعیت پرداخت را بررسی کنید.",
    };
  }
  for (const path of [
    "/charges",
    "/payments",
    "/reports",
    "/home",
    "/management",
    "/management/finance",
    "/management/expenses",
  ])
    revalidatePath(path, "layout");
  if (destination) redirect(destination);
  return { ok: true, message: "عملیات مالی با موفقیت ثبت شد." };
}
