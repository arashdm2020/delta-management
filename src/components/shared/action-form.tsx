"use client";
import { useActionState } from "react";
import { manageAction, profileAction, type ActionResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
const initial: ActionResult = { ok: false, message: "" };
export function ActionForm({
  children,
  profile = false,
  label = "ذخیره تغییرات",
  className = "",
}: {
  children: React.ReactNode;
  profile?: boolean;
  label?: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState(
    profile ? profileAction : manageAction,
    initial,
  );
  return (
    <form action={action} className={"grid gap-4 " + className}>
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
