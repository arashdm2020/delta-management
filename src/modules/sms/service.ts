import { smsEvents, type SmsEvent } from "./events";
import { sendFarazEvent } from "./faraz";
import { normalizePhone } from "@/lib/validation";
export type SmsResult = {
  status: "SIMULATED" | "ACCEPTED";
  providerMessageId: string;
};
export interface NotificationSmsProvider {
  send(input: {
    event?: SmsEvent;
    phone: string;
    template: string;
    content: string;
    idempotencyKey: string;
  }): Promise<SmsResult>;
}
export class DevelopmentNotificationSms implements NotificationSmsProvider {
  async send(input: {
    event?: SmsEvent;
    phone: string;
    template: string;
    content: string;
    idempotencyKey: string;
  }): Promise<SmsResult> {
    if (
      process.env.NODE_ENV !== "development" ||
      process.env.NOTIFICATION_SMS_PROVIDER !== "development"
    )
      throw new Error("UNCONFIGURED");
    normalizePhone(input.phone);
    if (input.event)
      smsEvents[input.event.event].schema.parse(input.event.payload);
    // No network, terminal logging, real message or false delivery confirmation.
    return {
      status: "SIMULATED",
      providerMessageId: "dev:" + input.idempotencyKey,
    };
  }
}
export function notificationSmsProvider(): NotificationSmsProvider {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NOTIFICATION_SMS_PROVIDER === "development"
  )
    return new DevelopmentNotificationSms();
  return {
    async send(input) {
      if (!input.event) throw new Error("UNCONFIGURED");
      return sendFarazEvent(
        input.phone,
        input.event.event,
        input.event.payload,
      );
    },
  };
}
