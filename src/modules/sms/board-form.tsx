"use client";

import { useActionState, useState } from "react";
import { boardSmsAction } from "./board-action";
import { Button } from "@/components/ui/button";

type Option = { id: string; label: string };
const audiences = [
  ["ALL", "همهٔ ساکنان"],
  ["OWNER", "مالکان"],
  ["TENANT", "مستأجران"],
  ["UNIT", "واحدها"],
  ["FLOOR", "طبقات"],
  ["DEBT", "مسئولان تعهدات باز"],
  ["CONTACT", "مخاطبان منتخب"],
];

export function BoardSmsForm({
  units,
  floors,
  contacts,
  initialUnit,
  message,
}: {
  units: Option[];
  floors: Option[];
  contacts: Option[];
  initialUnit?: string;
  message: string;
}) {
  const [kind, setKind] = useState(initialUnit ? "UNIT" : "ALL");
  const [state, action, pending] = useActionState(boardSmsAction, {
    message: "",
  });
  const options =
    kind === "UNIT"
      ? units
      : kind === "FLOOR"
        ? floors
        : kind === "CONTACT"
          ? contacts
          : [];
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-secondary">متن پترن: {message}</p>
      <form action={action} className="grid gap-4">
        <label className="field">
          گروه گیرندگان
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {audiences.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {options.length > 0 && (
          <fieldset key={kind}>
            <legend className="text-sm">انتخاب گیرندگان</legend>
            <div className="grid max-h-44 gap-x-4 overflow-y-auto sm:grid-cols-2">
              {options.map((option) => (
                <label
                  key={option.id}
                  className="flex min-h-10 items-center gap-2"
                >
                  <input
                    type="checkbox"
                    name={"selected-" + kind}
                    value={option.id}
                    defaultChecked={
                      kind === "UNIT" && option.id === initialUnit
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Button disabled={pending}>پیش‌نمایش گیرندگان</Button>
      </form>
      {state.preview && (
        <form
          action={action}
          className="grid gap-3 rounded-xl border border-border p-4"
        >
          <input type="hidden" name="operation" value="confirm" />
          <p className="font-medium">
            پیش‌نمایش · {state.preview.phones.length} شمارهٔ یکتا
          </p>
          <ul
            className="grid max-h-32 grid-cols-2 overflow-y-auto text-sm sm:grid-cols-4"
            dir="ltr"
          >
            {state.preview.phones.map((phone) => (
              <li key={phone}>{phone}</li>
            ))}
          </ul>
          <Button disabled={pending}>تأیید ارسال به همین گیرندگان</Button>
        </form>
      )}
      {state.message && (
        <p role={state.error ? "alert" : "status"}>{state.message}</p>
      )}
    </div>
  );
}
