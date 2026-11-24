"use client";
import { useActionState } from "react";
import { communicationAction } from "@/modules/notifications/actions";
import { Button } from "@/components/ui/button";
export function CommunicationForm({
  operation,
  label,
  children,
  className = "",
}: {
  operation: string;
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const [state, action, pending] = useActionState(communicationAction, {
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
