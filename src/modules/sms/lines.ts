import { z } from "zod";
// Candidate contract derived from official @farazsms_official/n8n-nodes-farazsms@0.2.0.
// A live response has NOT been independently verified; reject unknown shapes.
// GenericFunctions.getLines/extractRows: envelope data[] or data.data[], row.number.
const envelope = z.object({
  status: z.enum(["success", "error"]),
  data: z.unknown(),
});
const collection = z.union([
  z.array(z.unknown()),
  z.object({
    data: z.array(z.unknown()),
    last_page: z.number().int().positive().optional(),
    current_page: z.number().int().positive().optional(),
  }),
]);
export class SenderDiscoveryError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function parseAccessibleLines(value: unknown) {
  const outer = envelope.safeParse(value);
  if (!outer.success)
    throw new SenderDiscoveryError(
      "LINES_SCHEMA",
      "ساختار پاسخ خطوط با قرارداد رسمی سرویس سازگار نیست؛ پاسخ خطوط باید توسط پشتیبانی بررسی شود.",
    );
  if (outer.data.status !== "success")
    throw new SenderDiscoveryError(
      "LINES_REJECTED",
      "دسترسی به خطوط رد شد؛ اعتبار کلید و دسترسی وب‌سرویس را بررسی کنید.",
    );
  const parsed = collection.safeParse(outer.data.data);
  if (!parsed.success)
    throw new SenderDiscoveryError(
      "LINES_SCHEMA",
      "ساختار فهرست خطوط معتبر نیست؛ داده باید آرایه یا صفحه‌بندی رسمی سرویس باشد.",
    );
  const items = Array.isArray(parsed.data) ? parsed.data : parsed.data.data;
  const numbers: string[] = [];
  for (const item of items) {
    const row = z
      .object({
        number: z.union([z.string(), z.number().int().nonnegative().safe()]),
      })
      .safeParse(item);
    if (!row.success)
      throw new SenderDiscoveryError(
        "LINES_SCHEMA",
        "فیلد number خط ارسال در پاسخ سرویس موجود یا معتبر نیست؛ هیچ نام فیلد دیگری حدس زده نمی‌شود.",
      );
    const number = String(row.data.number).trim();
    if (/^[0-9]{3,20}$/.test(number)) numbers.push(number);
  }
  return {
    numbers: [...new Set(numbers)],
    lastPage: Array.isArray(parsed.data) ? 1 : parsed.data.last_page || 1,
    currentPage: Array.isArray(parsed.data)
      ? undefined
      : parsed.data.current_page,
  };
}
export async function discoverAccessibleLines(
  apiKey: string,
  transport: typeof fetch = fetch,
) {
  if (!apiKey.trim())
    throw new SenderDiscoveryError(
      "KEY_REQUIRED",
      "ابتدا کلید API را ثبت کنید یا آن را در تنظیمات سرور قرار دهید.",
    );
  const numbers = new Set<string>();
  let page = 1,
    lastPage = 1;
  do {
    let response: Response;
    try {
      response = await transport(
        "https://api.iranpayamak.com/ws/v1/lines/accessible" +
          (page === 1 ? "" : `?page=${page}`),
        {
          method: "GET",
          headers: { "Api-Key": apiKey, Accept: "application/json" },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch {
      throw new SenderDiscoveryError(
        "LINES_TIMEOUT",
        "ارتباط با سرویس خطوط برقرار نشد یا زمان آن تمام شد؛ دوباره دریافت خطوط را بزنید. تنظیمات قبلی تغییر نکرده است.",
      );
    }
    if ([401, 403].includes(response.status))
      throw new SenderDiscoveryError(
        "KEY_INVALID",
        "کلید API معتبر نیست یا اجازهٔ دریافت خطوط ندارد. تنظیمات قبلی تغییر نکرده است.",
      );
    if (response.status === 429)
      throw new SenderDiscoveryError(
        "LINES_RATE",
        "درخواست خطوط بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.",
      );
    if (!response.ok)
      throw new SenderDiscoveryError(
        "LINES_PROVIDER",
        `سرویس خطوط پاسخ ناموفق داد (HTTP ${response.status})؛ تنظیمات قبلی تغییر نکرده است.`,
      );
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new SenderDiscoveryError(
        "LINES_SCHEMA",
        "پاسخ سرویس خطوط JSON معتبر نیست؛ تنظیمات قبلی تغییر نکرده است.",
      );
    }
    const parsed = parseAccessibleLines(body);
    if (parsed.currentPage !== undefined && parsed.currentPage !== page)
      throw new SenderDiscoveryError(
        "LINES_SCHEMA",
        "صفحه‌بندی پاسخ سرویس معتبر نیست.",
      );
    parsed.numbers.forEach((number) => numbers.add(number));
    lastPage = parsed.lastPage;
    if (lastPage > 10 || numbers.size > 1000)
      throw new SenderDiscoveryError(
        "LINES_LIMIT",
        "فهرست خطوط از حد پردازش فراتر است؛ دسترسی خطوط را با پشتیبانی بررسی کنید.",
      );
    page++;
  } while (page <= lastPage);
  return [...numbers].sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true }),
  );
}
export function selectDiscoveredSender(
  lines: string[],
  previous: string,
  keyChanged = false,
) {
  if (lines.length === 1) return lines[0];
  return !keyChanged && lines.includes(previous) ? previous : "";
}
