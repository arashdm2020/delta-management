import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "min-h-12 w-full rounded-xl border border-input bg-white px-3 text-base outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
