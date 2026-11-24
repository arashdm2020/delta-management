import { jalaliInput } from "@/modules/billing/calendar";
import { normalizeDigits } from "@/modules/billing/schemas";
import { DomainError } from "@/lib/security/core";
const persian = new Intl.DateTimeFormat("en-US-u-ca-persian", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const civil = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function parts(format: Intl.DateTimeFormat, date: Date) {
  const p = format.formatToParts(date);
  return (type: string) => Number(p.find((v) => v.type === type)!.value);
}
// Invert the IANA timezone, rather than adding hours to midnight across a DST transition.
// Gaps and overlaps require a different, unambiguous local time; neither is silently shifted.
export function parseTehranDateTime(rawDate: string, rawTime: string) {
  const date = normalizeDigits(rawDate),
    time = normalizeDigits(rawTime);
  if (
    !/^14\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new DomainError("DATE", "تاریخ شمسی و ساعت تهران معتبر وارد کنید.");
  const [year, month, day] = date.split("-").map(Number),
    [hour, minute] = time.split(":").map(Number);
  let target: number | undefined;
  for (let n = 0; n < 550; n++) {
    const candidate = new Date(Date.UTC(year + 621, 0, 1 + n, 12));
    const p = parts(persian, candidate);
    if (p("year") === year && p("month") === month && p("day") === day) {
      target = Date.UTC(
        candidate.getUTCFullYear(),
        candidate.getUTCMonth(),
        candidate.getUTCDate(),
        hour,
        minute,
      );
      break;
    }
  }
  if (target === undefined)
    throw new DomainError("DATE", "روز انتخاب‌شده در این ماه وجود ندارد.");
  const offsets = new Set<number>();
  for (let h = -48; h <= 48; h += 6) {
    const instant = new Date(target + h * 3600000),
      p = parts(civil, instant);
    offsets.add(
      Date.UTC(
        p("year"),
        p("month") - 1,
        p("day"),
        p("hour"),
        p("minute"),
        p("second"),
      ) - instant.getTime(),
    );
  }
  const matches = [...offsets]
    .map((offset) => new Date(target! - offset))
    .filter((instant) => {
      const p = parts(civil, instant);
      return (
        Date.UTC(
          p("year"),
          p("month") - 1,
          p("day"),
          p("hour"),
          p("minute"),
        ) === target
      );
    });
  if (matches.length !== 1)
    throw new DomainError(
      "DATE",
      matches.length
        ? "این ساعت به دلیل تغییر ساعت رسمی دو بار رخ می‌دهد؛ ساعت دیگری انتخاب کنید."
        : "این ساعت به دلیل تغییر ساعت رسمی وجود ندارد؛ ساعت دیگری انتخاب کنید.",
    );
  return matches[0];
}
export function dateTimeFields(date = new Date()) {
  return {
    date: jalaliInput(date),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tehran",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date),
  };
}
