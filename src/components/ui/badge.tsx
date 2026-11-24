import type { ReactNode } from "react";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "neutral" | "error";
}) {
  return (
    <span
      className={
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium " +
        {
          success: "bg-emerald-50 text-emerald-800",
          warning: "bg-amber-50 text-amber-800",
          neutral: "bg-soft text-primary",
          error: "bg-red-50 text-red-800",
        }[tone]
      }
    >
      {children}
    </span>
  );
}
