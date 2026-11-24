import { db } from "@/lib/db";
import { sendFarazPattern } from "@/modules/sms/faraz";
export interface SmsProvider {
  send(phone: string, code: string): Promise<void>;
}
class DevelopmentSms implements SmsProvider {
  async send(phone: string, code: string) {
    if (
      process.env.NODE_ENV !== "development" ||
      process.env.DEV_SMS !== "true"
    )
      throw new Error("Development SMS disabled");
    // Local delivery is intentionally silent; no OTP enters logs.
    void phone;
    void code;
  }
}
class HttpSms implements SmsProvider {
  async send(phone: string, code: string) {
    if (await db.smsProviderSetting.count({ where: { key: "farazsms" } })) {
      await sendFarazPattern(phone, "OTP", code);
      return;
    }
    const endpoint = process.env.SMS_ENDPOINT;
    const token = process.env.SMS_TOKEN;
    if (!endpoint || !token) {
      await sendFarazPattern(phone, "OTP", code);
      return;
    }
    if (!endpoint.startsWith("https://"))
      throw new Error("SMS provider is not configured");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ phone, code }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("SMS delivery unavailable");
  }
}
export const smsProvider: SmsProvider =
  process.env.NODE_ENV === "development" && process.env.DEV_SMS === "true"
    ? new DevelopmentSms()
    : new HttpSms();
