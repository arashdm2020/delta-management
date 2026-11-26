"use client";
import { useActionState, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sendInboxResult } from "./actions";
import { Button } from "@/components/ui/button";

export function InboxForm({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(sendInboxResult, {
    ok: false,
    message: "",
    href: "",
  });
  useEffect(() => {
    if (state.ok && state.href) {
      router.push(state.href);
      router.refresh();
    }
  }, [state.ok, state.href, router]);
  return (
    <form id={id} action={action} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={state.ok ? "text-primary" : "text-red-700"}
        >
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "در حال ارسال…" : "ارسال پیام"}
      </Button>
    </form>
  );
}

type Choice = { value: string; label: string };
export function InboxRecipients({
  users,
  units,
  floors,
}: {
  users: Choice[];
  units: Choice[];
  floors: Choice[];
}) {
  const [kind, setKind] = useState("UNIT");
  const choices =
    kind === "UNIT"
      ? units
      : kind === "FLOOR"
        ? floors
        : kind === "USER"
          ? users
          : kind === "ROLE"
            ? [
                { value: "OWNER", label: "مالکان" },
                { value: "TENANT", label: "مستأجران" },
                { value: "BOARD_MEMBER", label: "هیئت‌مدیره" },
                { value: "SUPER_ADMIN", label: "مدیر سامانه" },
              ]
            : [];
  return (
    <>
      <label className="field">
        نوع مخاطب
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="UNIT">واحد</option>
          <option value="USER">کاربر</option>
          <option value="FLOOR">طبقه</option>
          <option value="ROLE">نقش</option>
          <option value="ALL">همه کاربران</option>
          <option value="BOARD">هیئت‌مدیره و مدیریت</option>
        </select>
      </label>
      {!["ALL", "BOARD"].includes(kind) && (
        <label className="field">
          گیرنده
          <select name="target" key={kind} required defaultValue="">
            <option value="">انتخاب کنید</option>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {choices.length === 0 && (
            <span className="text-sm text-secondary">
              گیرندهٔ تأییدشده‌ای برای این گروه ثبت نشده است.
            </span>
          )}
        </label>
      )}
    </>
  );
}
