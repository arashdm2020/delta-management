import { z } from "zod";
export function normalizePhone(value: string): string {
  const phone = value
    .replace(/[۰-۹٠-٩]/g, (c) =>
      String(
        c.charCodeAt(0) >= 1776
          ? c.charCodeAt(0) - 1776
          : c.charCodeAt(0) - 1632,
      ),
    )
    .replace(/[\s()-]/g, "");
  const normalized = phone.startsWith("0098")
    ? "+" + phone.slice(2)
    : phone.startsWith("09")
      ? "+98" + phone.slice(1)
      : phone;
  if (!/^\+989\d{9}$/.test(normalized))
    throw new Error("شماره همراه معتبر ایرانی وارد کنید.");
  return normalized;
}
export const phoneSchema = z
  .string()
  .max(40)
  .transform((value, ctx) => {
    try {
      return normalizePhone(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "شماره همراه معتبر نیست" });
      return z.NEVER;
    }
  });
export const uuid = z.uuid();
export const profileSchema = z.object({
  name: z.string().trim().min(3).max(100),
});
export const unitSchema = z.object({
  id: uuid.optional(),
  number: z.string().trim().min(1).max(30),
  floor: z.string().trim().min(1).max(30),
  occupancy: z.enum(["UNKNOWN", "VACANT", "OCCUPIED"]),
  active: z.boolean(),
});
export const membershipSchema = z.object({
  unitId: uuid,
  userId: uuid,
  kind: z.enum(["OWNER", "TENANT", "AUTHORIZED"]),
});
