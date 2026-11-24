import { z } from "zod";
export const normalizeDigits = (value: string) =>
  value.replace(/[۰-۹٠-٩]/g, (c) =>
    String(
      c.charCodeAt(0) >= 1776 ? c.charCodeAt(0) - 1776 : c.charCodeAt(0) - 1632,
    ),
  );
export const rialSchema = z
  .string()
  .transform(normalizeDigits)
  .pipe(z.string().regex(/^[0-9]{1,18}$/))
  .transform(BigInt)
  .refine((n) => n > 0n && n <= 9223372036854775807n, "مبلغ معتبر وارد کنید.");
export const tomanSchema = rialSchema
  .transform((n) => n * 10n)
  .refine((n) => n <= 9223372036854775807n);
export const reasonSchema = z.string().trim().min(3).max(500);
export const periodSchema = z
  .string()
  .transform(normalizeDigits)
  .pipe(z.string().regex(/^14\d{2}-(0[1-9]|1[0-2])$/));
