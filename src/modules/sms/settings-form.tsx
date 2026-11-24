"use client";
import { SenderProviderCard } from "./sender-provider-card";
import type { SenderPublicView } from "./sender-view";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { smsSettingsAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  smsEvents,
  smsEventKeys,
  requiredVariables,
  type SmsEventKey,
} from "./events";
type Template = {
  eventKey: string;
  providerCode: string | null;
  enabled: boolean;
  variableMapping: Record<string, string>;
  description: string;
  updatedAt: string;
  administrator: string;
};
type Schedule = {
  beforeDueDays: number;
  overdueDays: number;
  followupDays: number | null;
  meetingHours: number;
};
const initial = { ok: false, message: "" };
function Result({ state }: { state: typeof initial }) {
  return state.message ? (
    <p
      role={state.ok ? "status" : "alert"}
      className="rounded-xl bg-soft p-3 text-sm"
    >
      {state.message}
    </p>
  ) : null;
}
function PatternEditor({ template }: { template: Template }) {
  const event = template.eventKey as SmsEventKey;
  const [state, action, pending] = useActionState(smsSettingsAction, initial);
  return (
    <form action={action} className="grid gap-4" aria-label="ویرایش پترن">
      <input type="hidden" name="operation" value="template" />
      <input type="hidden" name="eventKey" value={event} />
      <h3 className="font-bold">{smsEvents[event].title}</h3>
      <p dir="ltr" className="break-all text-xs text-secondary">
        {event} · {smsEvents[event].pattern}
      </p>
      <label className="field">
        کد پترن سرویس‌دهنده
        <Input
          name="providerCode"
          defaultValue={template.providerCode || ""}
          dir="ltr"
          maxLength={100}
        />
      </label>
      <fieldset className="grid gap-3">
        <legend className="mb-3 font-medium">
          نگاشت متغیرها — همهٔ متغیرهای لازم
        </legend>
        {requiredVariables(event).map((variable) => (
          <label key={variable} className="field">
            متغیر برنامه: {variable}
            <Input
              name={`mapping.${variable}`}
              aria-label={`نگاشت ${variable}`}
              dir="ltr"
              defaultValue={template.variableMapping[variable] || ""}
              maxLength={40}
              placeholder="نام دقیق متغیر در پترن"
            />
          </label>
        ))}
      </fieldset>
      {event === "announcement.emergency" && (
        <p className="text-xs leading-6 text-secondary">
          فقط متن کنترل‌شدهٔ «اطلاعیه اضطراری ساختمان؛ برای مشاهده جزئیات وارد
          سامانه شوید.» ارسال می‌شود؛ متن آزاد اطلاعیه به سرویس منتقل نمی‌شود.
        </p>
      )}
      <label className="field">
        توضیحات
        <Input
          name="description"
          defaultValue={
            template.description === smsEvents[event].pattern
              ? smsEvents[event].title
              : template.description
          }
          maxLength={500}
        />
      </label>
      <label className="flex items-center gap-3">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={template.enabled}
        />
        فعال‌سازی این رویداد
      </label>
      <p className="text-xs text-secondary">
        آخرین تغییر:{" "}
        {new Intl.DateTimeFormat("fa-IR", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Tehran",
        }).format(new Date(template.updatedAt))}{" "}
        · {template.administrator}
      </p>
      <Result state={state} />
      <Button disabled={pending}>
        {pending ? "در حال ذخیره…" : "ذخیرهٔ پترن"}
      </Button>
    </form>
  );
}
export function SmsSettingsForm({
  settings,
  templates,
  schedule,
}: {
  settings: SenderPublicView;
  templates: Template[];
  schedule: Schedule;
}) {
  const editorRef = useRef<HTMLElement>(null);
  const [scheduleState, scheduleAction, schedulePending] = useActionState(
    smsSettingsAction,
    initial,
  );
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<SmsEventKey>("auth.otp");
  const selectedTemplate = templates.find((t) => t.eventKey === selected)!;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <SenderProviderCard settings={settings} />
        <Card>
          <h2 className="mb-4 font-bold">زمان‌بندی یادآوری‌ها</h2>
          <form
            action={scheduleAction}
            className="grid gap-4"
            aria-label="زمان‌بندی یادآوری"
          >
            <input type="hidden" name="operation" value="schedule" />
            <label className="field">
              چند روز قبل از سررسید
              <Input
                name="beforeDueDays"
                type="number"
                min={1}
                max={30}
                defaultValue={schedule.beforeDueDays}
                required
              />
            </label>
            <label className="field">
              چند روز پس از سررسید
              <Input
                name="overdueDays"
                type="number"
                min={1}
                max={30}
                defaultValue={schedule.overdueDays}
                required
              />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                name="followupEnabled"
                type="checkbox"
                defaultChecked={schedule.followupDays !== null}
              />
              پیگیری دوم فعال باشد
            </label>
            <label className="field">
              روز پیگیری دوم پس از سررسید
              <Input
                name="followupDays"
                type="number"
                min={2}
                max={90}
                defaultValue={schedule.followupDays || 7}
              />
            </label>
            <label className="field">
              یادآوری جلسه چند ساعت قبل
              <Input
                name="meetingHours"
                type="number"
                min={1}
                max={168}
                defaultValue={schedule.meetingHours}
                required
              />
            </label>
            <Result state={scheduleState} />
            <Button disabled={schedulePending}>ذخیرهٔ زمان‌بندی</Button>
          </form>
        </Card>
      </div>
      {settings.legacyConfigured && (
        <p className="rounded-xl bg-soft p-4 text-sm leading-7">
          تنظیمات دسته‌ای قبلی محفوظ است. فقط OTP به‌صورت خودکار منتقل شده؛ برای
          رویدادهای چندمتغیره، نگاشت را جداگانه تأیید و فعال کنید.
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <Card className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold">پترن‌های رویداد</h2>
            <label className="field text-sm">
              فیلتر دسته
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="min-h-11 rounded-xl border border-input bg-white px-3"
              >
                <option value="all">همه</option>
                <option value="financial">مالی</option>
                <option value="meetings">جلسات</option>
                <option value="tickets">درخواست‌ها</option>
                <option value="operational">اضطراری</option>
                <option value="security">ورود و امنیت</option>
              </select>
            </label>
          </div>
          <ul className="divide-y divide-border">
            {smsEventKeys
              .filter(
                (key) => filter === "all" || smsEvents[key].category === filter,
              )
              .map((key) => {
                const row = templates.find((t) => t.eventKey === key)!;
                const variables = requiredVariables(key);
                const valid =
                  Boolean(row.providerCode) &&
                  variables.every((v) => row.variableMapping[v]) &&
                  new Set(Object.values(row.variableMapping)).size ===
                    variables.length;
                return (
                  <li
                    key={key}
                    className="flex flex-wrap items-start justify-between gap-3 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium">{smsEvents[key].title}</h3>
                      <p
                        dir="ltr"
                        className="mt-1 break-all text-xs text-secondary"
                      >
                        {key}
                        <br />
                        {smsEvents[key].pattern}
                      </p>
                      <p className="mt-2 break-all text-xs">
                        کد: {row.providerCode || "ثبت نشده"} · متغیرها:{" "}
                        {variables.join("، ")}
                      </p>
                      <div className="mt-2">
                        <Badge
                          tone={row.enabled && valid ? "success" : "warning"}
                        >
                          {row.enabled
                            ? valid
                              ? "فعال و معتبر"
                              : "پیکربندی ناقص"
                            : "غیرفعال"}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      type="button"
                      aria-label={`ویرایش ${smsEvents[key].title}`}
                      onClick={() => {
                        setSelected(key);
                        requestAnimationFrame(() => {
                          editorRef.current?.scrollIntoView({ block: "start" });
                          editorRef.current?.focus({ preventScroll: true });
                        });
                      }}
                    >
                      ویرایش
                    </Button>
                  </li>
                );
              })}
          </ul>
        </Card>
        <Card
          className="min-w-0"
          ref={editorRef}
          tabIndex={-1}
          aria-label="ویرایش پترن انتخاب‌شده"
        >
          <PatternEditor key={selected} template={selectedTemplate} />
        </Card>
      </div>
      <Link
        className="nav-extra bg-white text-primary"
        href="/management/communications/deliveries"
      >
        تاریخچهٔ ارسال و نتیجهٔ سرویس‌دهنده
      </Link>
      <p className="text-xs leading-7 text-secondary">
        پذیرش توسط سرویس‌دهنده به معنی تحویل به گوشی نیست. حالت توسعهٔ پیامک حفظ
        شده و هیچ کلید ذخیره‌شده‌ای به مرورگر بازگردانده نمی‌شود.
      </p>
    </div>
  );
}
