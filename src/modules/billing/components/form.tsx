"use client";
import { useActionState } from "react";
import { financeAction } from "@/modules/billing/actions";
import { Button } from "@/components/ui/button";
export function FinanceForm({
  children,
  label,
  operation,
  className = "",
}: {
  children?: React.ReactNode;
  label: string;
  operation: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState(financeAction, {
    ok: false,
    message: "",
  });
  return (
    <form action={action} className={"grid gap-4 " + className}>
      <input type="hidden" name="operation" value={operation} />
      {children}
      {state.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={
            "rounded-xl p-3 text-sm " +
            (state.ok ? "bg-soft text-primary" : "bg-red-50 text-red-800")
          }
        >
          {state.message}
        </p>
      )}
      <Button disabled={pending} type="submit">
        {pending ? "در حال ثبت…" : label}
      </Button>
    </form>
  );
}
