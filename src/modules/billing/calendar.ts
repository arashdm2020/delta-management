import { DomainError } from "@/lib/security/core";
import { periodSchema } from "./schemas";
const calendar = new Intl.DateTimeFormat("en-US-u-ca-persian", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
export function currentPeriod(date = new Date()) {
  const parts = calendar.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month").padStart(2, "0")}`;
}
// Search civil days using Intl's Persian calendar; no approximate year/leap algorithm.
export function periodBounds(raw: string) {
  const key = periodSchema.parse(raw);
  const [year, month] = key.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  let start: Date | undefined;
  let end: Date | undefined;
  for (let day = 0; day < 550; day++) {
    const noon = new Date(Date.UTC(year + 621, 0, 1 + day, 12));
    const parts = calendar.formatToParts(noon);
    const part = (type: string) =>
      Number(parts.find((p) => p.type === type)!.value);
    if (part("day") !== 1) continue;
    if (
      (part("year") === year && part("month") === month) ||
      (part("year") === nextYear && part("month") === nextMonth)
    ) {
      const offset = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tehran",
        timeZoneName: "shortOffset",
      })
        .formatToParts(noon)
        .find((p) => p.type === "timeZoneName")!.value;
      const match = offset.match(/GMT([+-])(\d+)(?::(\d+))?/)!;
      const minutes =
        (Number(match[2]) * 60 + Number(match[3] || 0)) *
        (match[1] === "+" ? 1 : -1);
      const midnight = new Date(
        Date.UTC(noon.getUTCFullYear(), noon.getUTCMonth(), noon.getUTCDate()) -
          minutes * 60000,
      );
      if (part("year") === year && part("month") === month) start = midnight;
      else end = midnight;
    }
    if (start && end)
      return {
        key,
        startsAt: start,
        endsAt: end,
        dueAt: start,
      };
  }
  throw new Error("ماه شمسی معتبر نیست.");
}

export function jalaliInput(date = new Date()) {
  const parts = calendar.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month").padStart(2, "0")}-${part("day").padStart(2, "0")}`;
}
export function parseJalaliDate(raw: string) {
  const value = raw.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776));
  if (!/^14\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))
    throw new DomainError("DATE", "تاریخ شمسی معتبر وارد کنید.");
  const bounds = periodBounds(value.slice(0, 7));
  const day = Number(value.slice(8));
  const date = new Date(bounds.startsAt.getTime() + (day - 1) * 86400000);
  if (date >= bounds.endsAt || jalaliInput(date) !== value)
    throw new DomainError("DATE", "روز انتخاب‌شده در این ماه وجود ندارد.");
  return date;
}

/** Human-facing cycle; the next month's first day is the exclusive endpoint. */
export function paymentPeriodLabel(key: string) {
  const { startsAt, endsAt } = periodBounds(key);
  const format = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `${format.format(startsAt)} تا ${format.format(endsAt)}`;
}
