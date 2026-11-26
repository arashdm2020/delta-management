import { z } from "zod";
const text = z.string().trim().min(1).max(300);
export const inboxSmsText = "پیام جدید در سامانه ساختمان؛ برای مشاهده وارد سامانه شوید." as const;
export const smsEvents = {
  "inbox.message": {
    pattern: "delta_inbox_message",
    title: "پیام جدید صندوق پیام‌ها",
    category: "operational",
    schema: z.object({}).strict(),
  },
  "auth.otp": {
    pattern: "delta_login",
    title: "کد ورود",
    category: "security",
    schema: z.object({ code: z.string().regex(/^(?:\d{4}|\d{6})$/) }).strict(),
  },
  "billing.invoice.issued": {
    pattern: "delta_charge_issued",
    title: "ثبت شارژ ماهانه",
    category: "financial",
    schema: z
      .object({ period: text, unit: text, amount: text, due_date: text })
      .strict(),
  },
  "billing.invoice.reminder": {
    pattern: "delta_charge_reminder",
    title: "یادآوری سررسید شارژ",
    category: "financial",
    schema: z.object({ unit: text, amount: text, due_date: text }).strict(),
  },
  "billing.invoice.overdue": {
    pattern: "delta_charge_overdue",
    title: "شارژ پرداخت‌نشده",
    category: "financial",
    schema: z.object({ unit: text, amount: text, due_date: text }).strict(),
  },
  "billing.payment.confirmed": {
    pattern: "delta_payment_success",
    title: "تأیید پرداخت",
    category: "financial",
    schema: z.object({ unit: text, amount: text, receipt: text }).strict(),
  },
  "meeting.invitation": {
    pattern: "delta_meeting_invite",
    title: "دعوت به جلسه",
    category: "meetings",
    schema: z
      .object({ title: text, date: text, time: text, location: text })
      .strict(),
  },
  "meeting.reminder": {
    pattern: "delta_meeting_reminder",
    title: "یادآوری جلسه",
    category: "meetings",
    schema: z.object({ title: text, date: text, time: text }).strict(),
  },
  "ticket.status.changed": {
    pattern: "delta_ticket_update",
    title: "تغییر وضعیت درخواست",
    category: "tickets",
    schema: z.object({ ticket: text, status: text }).strict(),
  },
  "announcement.board": {
    pattern: "delta_board_announcement",
    title: "اطلاعیه هیئت‌مدیره",
    category: "operational",
    schema: z.object({}).strict(),
  },
  "announcement.emergency": {
    pattern: "delta_urgent_alert",
    title: "اطلاعیه اضطراری",
    category: "operational",
    schema: z.object({}).strict(),
  },
} as const;
export type SmsEventKey = keyof typeof smsEvents;
export type SmsEventPayloads = {
  [K in SmsEventKey]: z.infer<(typeof smsEvents)[K]["schema"]>;
};
export type SmsEvent = {
  [K in SmsEventKey]: { event: K; payload: SmsEventPayloads[K] };
}[SmsEventKey];
export const smsEventKeys = Object.keys(smsEvents) as SmsEventKey[];
export const providerVariable = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/);
export function requiredVariables(event: SmsEventKey) {
  return Object.keys(smsEvents[event].schema.shape);
}
export function validateMapping(event: SmsEventKey, mapping: unknown) {
  const parsed = z.record(z.string(), providerVariable).safeParse(mapping);
  if (!parsed.success)
    throw new Error("SMS_MAPPING_INVALID: نام متغیرهای پترن معتبر نیست.");
  const required = requiredVariables(event);
  if (
    Object.keys(parsed.data).length !== required.length ||
    required.some((key) => !parsed.data[key]) ||
    new Set(Object.values(parsed.data)).size !== required.length
  )
    throw new Error(
      "SMS_MAPPING_INVALID: همهٔ متغیرهای لازم باید به نام‌های یکتا متصل شوند.",
    );
  return parsed.data;
}
export function mappedVariables<K extends SmsEventKey>(
  event: K,
  payload: SmsEventPayloads[K],
  mapping: unknown,
) {
  const parsed = smsEvents[event].schema.safeParse(payload);
  if (!parsed.success)
    throw new Error(
      "SMS_PAYLOAD_INVALID: متغیرهای الزامی پیامک ناقص یا نامعتبر است.",
    );
  const bindings = validateMapping(event, mapping);
  return Object.fromEntries(
    Object.entries(parsed.data).map(([key, value]) => [bindings[key], value]),
  );
}
