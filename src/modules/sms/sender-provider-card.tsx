"use client";
import { useActionState, useRef, useState } from "react";
import { smsSettingsAction } from "./actions";
import type { SenderPublicView, SmsActionResult } from "./sender-view";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
function SenderFields({ view }: { view: SenderPublicView }) {
  const [manual, setManual] = useState(view.source === "MANUAL");
  return (
    <>
      <input name="expectedRevision" type="hidden" value={view.revision} />
      <p className="text-xs leading-6 text-secondary">
        منبع:{" "}
        {view.source === "DISCOVERED"
          ? "فهرست حساب؛ مجوز پترن جداگانه تأیید می‌شود"
          : view.source === "MANUAL"
            ? "دستی با تأیید مدیر"
            : "تنظیمات قبلی یا ثبت‌نشده"}
      </p>
      <label className="field">
        خطوط قابل‌دسترسی حساب
        <select
          key={view.revision}
          name="fromNumber"
          defaultValue={
            view.lines.includes(view.fromNumber) ? view.fromNumber : ""
          }
          disabled={manual || !view.lines.length}
          className="min-h-12 min-w-0 w-full rounded-xl border border-input bg-white px-3"
        >
          <option value="">خط ارسال را انتخاب کنید</option>
          {view.lines.map((number) => (
            <option value={number} key={number}>
              {number}
            </option>
          ))}
        </select>
      </label>
      {!view.lines.length && (
        <p className="text-sm text-secondary">
          فهرست خطی موجود نیست؛ ابتدا دریافت خطوط را بزنید. هیچ خط پیش‌فرضی فرض
          نمی‌شود.
        </p>
      )}
      <label className="flex items-start gap-3 text-sm leading-7">
        <input
          name="manual"
          type="checkbox"
          checked={manual}
          onChange={(e) => setManual(e.target.checked)}
          className="mt-2"
        />
        روش دستی در صورت عدم دسترسی به کشف خطوط
      </label>
      {manual && (
        <label className="field">
          شمارهٔ خط تأییدشده در پنل
          <Input
            name="manualNumber"
            dir="ltr"
            inputMode="numeric"
            defaultValue={view.fromNumber}
            pattern="[0-9]{3,20}"
            maxLength={20}
            required
          />
          <span className="text-xs text-secondary">
            فقط رقم انگلیسی؛ شماره را از پنل حساب خود بردارید، نه از نمونهٔ
            پروژه‌های دیگر.
          </span>
        </label>
      )}
      <label className="flex items-start gap-3 text-sm leading-7">
        <input
          name="patternConfirmed"
          type="checkbox"
          defaultChecked={view.patternConfirmed}
          className="mt-2"
        />
        تأیید می‌کنم مجوز استفاده از این خط برای ارسال پترن را در پنل یا با
        پشتیبانی بررسی کرده‌ام.
      </label>
      <label className="flex items-start gap-3 text-sm leading-7">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={view.enabled}
          className="mt-2"
        />
        فعال‌سازی ارسال واقعی (ممکن است هزینه داشته باشد)
      </label>
    </>
  );
}
export function SenderProviderCard({
  settings,
}: {
  settings: SenderPublicView;
}) {
  const keyInput = useRef<HTMLInputElement>(null);
  const [keyChanged, setKeyChanged] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: SmsActionResult, form: FormData) => {
      const result = await smsSettingsAction(previous, form);
      if (result.provider) {
        if (keyInput.current) keyInput.current.value = "";
        setKeyChanged(false);
      }
      return result;
    },
    { ok: false, message: "" } as SmsActionResult,
  );
  const view = state.provider || settings;
  const fields = keyChanged
    ? { ...view, patternConfirmed: false, lines: [], enabled: false }
    : view;
  return (
    <Card className="min-w-0">
      <h2 className="mb-4 font-bold">سرویس‌دهنده و انتخاب خط ارسال</h2>
      <Badge
        tone={view.enabled && view.patternConfirmed ? "success" : "warning"}
      >
        {view.enabled && view.patternConfirmed
          ? "فعال با تأیید مدیر؛ تحویل آزمایش نشده"
          : "نیازمند تنظیم یا تأیید؛ ارسال آزمایشی انجام نمی‌شود"}
      </Badge>
      <p className="mt-4 text-xs leading-7 text-secondary">
        کشف خطوط بر پایهٔ parser بستهٔ رسمی است و با پاسخ زندهٔ این حساب تأیید نشده
        است. خط قابل‌دسترسی الزاماً برای پترن مجاز نیست؛ خط اشتراکی یا خدماتیِ
        مجاز هم قابل انتخاب است.
      </p>
      <form
        action={action}
        aria-label="تنظیمات سرویس‌دهنده"
        className="mt-5 grid gap-4"
      >
        <label className="field">
          کلید API فراز پیامک
          <Input
            ref={keyInput}
            name="apiKey"
            type="password"
            autoComplete="new-password"
            maxLength={1000}
            disabled={pending}
            onChange={() => setKeyChanged(true)}
          />
        </label>
        <p className="text-xs text-secondary">
          {view.hasApiKey
            ? "کلید موجود فقط در سرور استفاده می‌شود؛ خالی گذاشتن، آن را حفظ می‌کند."
            : "کلید را اینجا وارد کنید یا در متغیر سرور FARAZSMS_API_KEY قرار دهید."}
        </p>
        <label className="flex items-center gap-3 text-sm">
          <input name="clearApiKey" type="checkbox" />
          حذف کلید ذخیره‌شده
        </label>
        <SenderFields
          key={fields.revision + String(keyChanged)}
          view={fields}
        />
        {state.message && (
          <p
            role={state.ok ? "status" : "alert"}
            className="rounded-xl bg-soft p-3 text-sm leading-7"
          >
            {state.message}
          </p>
        )}
        {pending && (
          <p role="status" className="text-sm text-secondary">
            در حال بررسی و ذخیرهٔ تنظیمات…
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            name="operation"
            value="discover"
            formNoValidate
            disabled={pending}
          >
            دریافت / تازه‌سازی خطوط
          </Button>
          <Button name="operation" value="provider" disabled={pending}>
            ذخیرهٔ تنظیمات پیامک
          </Button>
        </div>
      </form>
    </Card>
  );
}
