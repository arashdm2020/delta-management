import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
export const digits = (n: number | bigint) =>
  new Intl.NumberFormat("fa-IR").format(n);
export const maskPhone = (phone: string) =>
  phone.slice(0, 3) + "••••••" + phone.slice(-4);
export const rialToToman = (rial: bigint) => {
  const negative = rial < 0n;
  const absolute = negative ? -rial : rial;
  return (
    (negative ? "−" : "") +
    digits(absolute / 10n) +
    (absolute % 10n ? "٫" + digits(absolute % 10n) : "") +
    " تومان"
  );
};
