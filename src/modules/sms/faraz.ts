import { z } from "zod";
import {
  mappedVariables,
  type SmsEventKey,
  type SmsEventPayloads,
} from "./events";
import { normalizePhone } from "@/lib/validation";
import { db } from "@/lib/db";
import { decryptSmsKey, senderCredentialHash } from "./settings";
// Verified Vetly / IranPayamak pattern contract. No sender fallback.
export async function sendFarazEvent<K extends SmsEventKey>(
  phone: string,
  event: K,
  payload: SmsEventPayloads[K],
  transport: typeof fetch = fetch,
) {
  const setting = await db.smsProviderSetting.findUnique({
    where: { key: "farazsms" },
  });
  if (!setting?.enabled || !setting.encryptedApiKey)
    throw new Error("UNCONFIGURED");
  const apiKey = decryptSmsKey(setting.encryptedApiKey);
  if (
    !setting.senderPatternConfirmed ||
    !setting.senderSource ||
    setting.senderKeyHash !== senderCredentialHash(apiKey) ||
    !/^[0-9]{3,20}$/.test(setting.fromNumber)
  )
    throw new Error("SENDER_UNCONFIRMED");
  if (
    setting.senderSource === "DISCOVERED" &&
    (!Array.isArray(setting.senderLines) ||
      !setting.senderLines.includes(setting.fromNumber))
  )
    throw new Error("SENDER_UNAVAILABLE");
  const template = await db.smsEventTemplate.findUnique({
    where: { eventKey: event },
  });
  if (!template?.enabled) throw new Error("PATTERN_DISABLED");
  if (!template.providerCode) throw new Error("SMS_MAPPING_INVALID");
  const params = mappedVariables(event, payload, template.variableMapping);
  let response: Response;
  try {
    response = await transport(
      "https://api.iranpayamak.com/ws/v1/sms/pattern",
      {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": apiKey,
          Accept: "application/json",
        },
        body: JSON.stringify({
          line_number: setting.fromNumber,
          number_format: "persian",
          code: template.providerCode,
          recipient: "0" + normalizePhone(phone).slice(3),
          attributes: params,
        }),
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      },
    );
  } catch {
    throw new Error("UNKNOWN");
  }
  if (response.status === 429) throw new Error("TRANSIENT");
  if (!response.ok)
    throw new Error(response.status >= 500 ? "UNKNOWN" : "PROVIDER_REJECTED");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("UNKNOWN");
  }
  const envelope = z
    .object({ status: z.enum(["success", "error"]), data: z.unknown() })
    .safeParse(body);
  if (!envelope.success) throw new Error("UNKNOWN");
  if (envelope.data.status !== "success") throw new Error("PROVIDER_REJECTED");
  const id = z.number().int().positive().safe().safeParse(envelope.data.data);
  if (!id.success) throw new Error("UNKNOWN");
  return { status: "ACCEPTED" as const, providerMessageId: String(id.data) };
}

// Compatibility for existing OTP callers; legacy category patterns are retained, never guessed.
export async function sendFarazPattern(
  phone: string,
  category: string,
  value: string,
  transport: typeof fetch = fetch,
) {
  if (category !== "OTP") throw new Error("UNCONFIGURED");
  return sendFarazEvent(phone, "auth.otp", { code: value }, transport);
}
