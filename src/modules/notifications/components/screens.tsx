import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/security/core";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { digits } from "@/lib/utils";
import { jalaliTime } from "@/lib/dates";
import { CommunicationForm as Form } from "./form";
import {
  CommunicationStatus as Status,
  AttachmentLinks,
  Pagination,
} from "./display";
import { PushControls } from "./push-controls";
import { labels } from "../labels";
import { dateTimeFields } from "../calendar";
import {
  announcementList,
  getAnnouncement,
  announcementStats,
  announcementCategories,
  priorities,
} from "@/modules/announcements/service";
import { notificationList, preferences } from "../service";
import { devices, pushConfiguration } from "@/modules/push/service";
import {
  communicationOptions,
  communicationOverview,
  deliveryHistory,
} from "../queries";
import {
  ticketList,
  getTicket,
  ticketCategories,
  ticketStatuses,
  ticketTransitions,
} from "@/modules/tickets/service";
import { meetingList, getMeeting } from "@/modules/meetings/service";
import {
  resolutionsForMeeting,
  resolutionIndex,
} from "@/modules/governance/service";
import { jalaliInput } from "@/modules/billing/calendar";
export type Query = {
  page?: string;
  status?: string;
  category?: string;
  history?: string;
};
const textClass =
  "min-h-32 w-full rounded-xl border border-input bg-white p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
function Text({
  name,
  label,
  value = "",
  max = 10000,
}: {
  name: string;
  label: string;
  value?: string;
  max?: number;
}) {
  return (
    <label className="field">
      {label}
      <textarea
        name={name}
        defaultValue={value}
        required
        minLength={3}
        maxLength={max}
        className={textClass}
      />
    </label>
  );
}
function FileField() {
  return (
    <label className="field">
      پیوست PDF یا تصویر، حداکثر ۲ مگابایت
      <Input
        name="document"
        type="file"
        accept="application/pdf,image/png,image/jpeg"
      />
    </label>
  );
}
function Hidden({ id }: { id: string }) {
  return <input type="hidden" name="id" value={id} />;
}
function Options({ values }: { values: readonly string[] }) {
  return values.map((v) => (
    <option key={v} value={v}>
      {labels[v] || v}
    </option>
  ));
}
function Empty({ text }: { text: string }) {
  return (
    <Card>
      <p className="text-sm text-secondary">{text}</p>
    </Card>
  );
}
function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <div>
      <h1 className="page-heading">{title}</h1>
      {body && <p className="page-description">{body}</p>}
    </div>
  );
}
export async function AnnouncementsScreen({
  actor,
  manage = false,
  query = {},
}: {
  actor: Actor;
  manage?: boolean;
  query?: Query;
}) {
  const result = await announcementList(actor, {
    page: Number(query.page),
    history: query.history === "1",
    manage,
  });
  const base = manage ? "/management/announcements" : "/announcements";
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <Heading
        title={manage ? "مدیریت اطلاعیه‌ها" : "اطلاعیه‌های ساختمان"}
        body="اطلاعیه‌های مربوط به شما و رسید مطالعه در سامانه نگهداری می‌شود."
      />
      {manage ? (
        <Link className="nav-extra bg-white text-primary" href={base + "/new"}>
          اطلاعیه جدید
        </Link>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Link className="nav-extra bg-white" href={base}>
            اطلاعیه‌های جاری
          </Link>
          <Link className="nav-extra bg-white" href={base + "?history=1"}>
            بایگانی اطلاعیه‌ها
          </Link>
          <Link
            className="nav-extra bg-white text-primary"
            href="/notifications"
          >
            مرکز اعلان‌ها
          </Link>
        </div>
      )}
      {result.rows.length ? (
        result.rows.map((a) => (
          <Card
            key={a.id}
            className={
              a.category === "EMERGENCY" ? "border-red-200 bg-red-50" : ""
            }
          >
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="font-bold">{a.title}</h2>
              <Status status={a.category} />
            </div>
            <div className="my-3 flex flex-wrap gap-2">
              <Status status={a.status} />
              <Status status={a.priority} />
              {!manage && (
                <span className="text-xs text-secondary">
                  {a.isRead ? "خوانده‌شده" : "خوانده‌نشده"}
                </span>
              )}
            </div>
            <p className="text-xs text-secondary">
              {jalaliTime(a.publishedAt || a.createdAt)}
            </p>
            <Link
              className="nav-extra mt-3 text-primary"
              href={base + "/" + a.id}
            >
              {manage ? "ویرایش و آمار اطلاعیه" : "مشاهده اطلاعیه"}
            </Link>
          </Card>
        ))
      ) : (
        <Empty text="اطلاعیه‌ای در این فهرست وجود ندارد." />
      )}
      <Pagination
        page={result.page}
        total={result.total}
        href={base + (query.history === "1" ? "?history=1" : "")}
      />
    </div>
  );
}
export async function AnnouncementDetail({
  actor,
  id,
  manage = false,
}: {
  actor: Actor;
  id: string;
  manage?: boolean;
}) {
  const a = await getAnnouncement(actor, id);
  const stats = manage ? await announcementStats(actor, id) : null;
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <Heading title={a.title} />
      <Card
        className={a.category === "EMERGENCY" ? "border-red-200 bg-red-50" : ""}
      >
        <div className="mb-4 flex flex-wrap gap-3">
          <Status status={a.category} />
          <Status status={a.priority} />
          <Status status={a.status} />
        </div>
        <p className="whitespace-pre-wrap leading-8">{a.content}</p>
        <p className="mt-5 text-xs text-secondary">
          نویسنده: {a.authorName || "مدیریت ساختمان"} ·{" "}
          {jalaliTime(a.publishedAt || a.createdAt)}
        </p>
        {a.expiresAt && (
          <p className="mt-2 text-xs text-secondary">
            انقضا: {jalaliTime(a.expiresAt)}
          </p>
        )}
        <AttachmentLinks attachments={a.attachments} />
      </Card>
      {a.isRecipient && (
        <Card>
          <p className="mb-3 text-sm">
            وضعیت مطالعه شما: {a.isRead ? "خوانده‌شده" : "خوانده‌نشده"}
          </p>
          {!a.isRead && (
            <Form operation="announcement-read" label="ثبت مطالعه اطلاعیه">
              <Hidden id={id} />
            </Form>
          )}
        </Card>
      )}
      {stats && (
        <Card>
          <h2 className="mb-3 font-bold">آمار دریافت و مطالعه</h2>
          <p className="text-sm">
            مخاطبان: {digits(stats.recipients)} · مطالعه‌شده:{" "}
            {digits(stats.read)}
          </p>
          {stats.channels.map((c) => (
            <p key={c.channel + c.status} className="mt-3 text-sm">
              {labels[c.channel]} · {labels[c.status]}: {digits(c._count)}
            </p>
          ))}
        </Card>
      )}
    </div>
  );
}
export async function AnnouncementEditor({
  actor,
  id,
}: {
  actor: Actor;
  id?: string;
}) {
  const a = id ? await getAnnouncement(actor, id) : null;
  const options = await communicationOptions(actor);
  const publish = a?.publishAt ? dateTimeFields(a.publishAt) : null;
  const audiences = a?.audiences || [];
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <Heading title={id ? "ویرایش و انتشار اطلاعیه" : "اطلاعیه جدید"} />
      {a && <AnnouncementDetail actor={actor} id={a.id} manage />}
      {(!a || ["DRAFT", "SCHEDULED"].includes(a.status)) && (
        <Card>
          <Form operation="announcement-save" label="ذخیره پیش‌نویس اطلاعیه">
            {id && <Hidden id={id} />}
            <label className="field">
              عنوان اطلاعیه
              <Input
                name="title"
                defaultValue={a?.title || ""}
                required
                minLength={3}
                maxLength={200}
              />
            </label>
            <Text name="content" label="متن اطلاعیه" value={a?.content} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                دسته اطلاعیه
                <select name="category" defaultValue={a?.category || "GENERAL"}>
                  <Options values={announcementCategories} />
                </select>
              </label>
              <label className="field">
                اولویت
                <select name="priority" defaultValue={a?.priority || "NORMAL"}>
                  <Options values={priorities} />
                </select>
              </label>
              <label className="field">
                مخاطبان
                <select
                  name="audienceKind"
                  defaultValue={audiences[0]?.kind || "ALL"}
                >
                  <Options
                    values={["ALL", "OWNERS", "TENANTS", "UNITS", "BOARD"]}
                  />
                </select>
              </label>
              <label className="field">
                واحدهای انتخابی (فقط برای مخاطب واحدها)
                <select
                  name="unitId"
                  multiple
                  size={Math.max(2, Math.min(5, options.units.length))}
                  defaultValue={audiences.flatMap((v) =>
                    v.unitId ? [v.unitId] : [],
                  )}
                >
                  {options.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      واحد {u.number}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                تاریخ انتشار شمسی (اختیاری)
                <Input
                  name="publishDate"
                  dir="ltr"
                  placeholder="1405-09-02"
                  defaultValue={publish?.date || ""}
                />
              </label>
              <label className="field">
                ساعت انتشار تهران
                <Input
                  name="publishTime"
                  dir="ltr"
                  defaultValue={publish?.time || "09:00"}
                  placeholder="09:00"
                />
              </label>
              <label className="field">
                تاریخ انقضا شمسی (اختیاری)
                <Input
                  name="expiresDate"
                  dir="ltr"
                  defaultValue={a?.expiresAt ? jalaliInput(a.expiresAt) : ""}
                />
              </label>
            </div>
            <FileField />
          </Form>
          <p className="mt-4 text-xs leading-6 text-secondary">
            تاریخ خالی یعنی انتشار فوری پس از تأیید انتشار. زمان آینده در صف
            انتشار قرار می‌گیرد. اطلاعیه اضطراری با اولویت فوری ثبت می‌شود.
          </p>
        </Card>
      )}
      {a && a.status !== "ARCHIVED" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {a.status !== "PUBLISHED" && (
            <Form
              operation="announcement-publish"
              label="انتشار یا زمان‌بندی اطلاعیه"
            >
              <Hidden id={a.id} />
            </Form>
          )}
          <Form operation="announcement-archive" label="بایگانی اطلاعیه">
            <Hidden id={a.id} />
          </Form>
        </div>
      )}
    </div>
  );
}
export async function NotificationsScreen({
  actor,
  query = {},
}: {
  actor: Actor;
  query?: Query;
}) {
  const result = await notificationList(actor, Number(query.page));
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <Heading
        title="مرکز اعلان‌ها"
        body={digits(result.unread) + " اعلان خوانده‌نشده"}
      />
      <Form operation="notification-all" label="خواندن همه اعلان‌ها" />
      {result.rows.length ? (
        result.rows.map((n) => (
          <Card key={n.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="font-bold">{n.title}</h2>
              <Status status={n.category} />
            </div>
            <p className="my-3 text-sm">{n.body}</p>
            <p className="text-xs text-secondary">
              {jalaliTime(n.createdAt)} ·{" "}
              {n.readAt ? "خوانده‌شده" : "خوانده‌نشده"}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Form operation="notification-open" label="مشاهده پیام مرتبط">
                <Hidden id={n.id} />
              </Form>
              <Form
                operation="notification-read"
                label={
                  n.readAt
                    ? "علامت‌گذاری خوانده‌نشده"
                    : "علامت‌گذاری خوانده‌شده"
                }
              >
                <Hidden id={n.id} />
                <input
                  type="hidden"
                  name="read"
                  value={n.readAt ? "false" : "true"}
                />
              </Form>
            </div>
          </Card>
        ))
      ) : (
        <Empty text="اعلانی برای شما ثبت نشده است." />
      )}
      <Pagination
        page={result.page}
        total={result.total}
        href="/notifications"
      />
      <Link className="nav-extra text-primary" href="/settings/notifications">
        تنظیمات اعلان‌ها
      </Link>
    </div>
  );
}
export async function PreferencesScreen({ actor }: { actor: Actor }) {
  const [pref, list] = await Promise.all([preferences(actor), devices(actor)]);
  const configured = pushConfiguration().enabled;
  const settings = [
    { key: "general", label: "اطلاعیه‌های عمومی" },
    { key: "financial", label: "یادآوری‌های مالی" },
    { key: "meetings", label: "دعوت و یادآوری جلسات" },
    { key: "tickets", label: "به‌روزرسانی درخواست‌ها" },
    { key: "push", label: "دریافت اعلان دستگاه" },
    { key: "sms", label: "دریافت پیامک اطلاع‌رسانی" },
  ] as const;
  return (
    <div className="mx-auto max-w-3xl space-y-6 [overflow-wrap:anywhere]">
      <Heading title="تنظیمات اعلان‌ها" />
      <Card>
        <Form operation="preferences" label="ذخیره ترجیحات اعلان">
          {settings.map((s) => (
            <label
              className="flex min-h-11 items-center gap-3 text-sm"
              key={s.key}
            >
              <input
                type="checkbox"
                name={s.key}
                defaultChecked={pref[s.key]}
                className="size-5 accent-primary"
              />
              {s.label}
            </label>
          ))}
        </Form>
        <p className="mt-4 text-sm leading-7 text-secondary">
          اطلاعیه ضروری عملیاتی و امنیتی داخل سامانه باقی می‌ماند. این تنظیمات
          کد ورود و پیام‌های امنیت حساب را غیرفعال نمی‌کند.
        </p>
        <p className="mt-3 text-xs text-secondary">
          پیامک واقعی تا پیکربندی ارائه‌دهنده مستند، ارسال نمی‌شود. شبیه‌سازی
          توسعه به معنی تحویل پیامک نیست.
        </p>
      </Card>
      <Card>
        <h2 className="mb-4 font-bold">اعلان این دستگاه</h2>
        <PushControls configured={configured} />
      </Card>
      <section className="space-y-4">
        <h2 className="font-bold">دستگاه‌های حساب من</h2>
        {list.length ? (
          list.map((d) => (
            <Card key={d.id}>
              <h3 className="font-bold">{d.deviceName}</h3>
              <p className="my-3 text-xs text-secondary">
                ثبت {jalaliTime(d.createdAt)} ·{" "}
                {d.revokedAt ? "لغوشده" : "فعال"}
              </p>
              {!d.revokedAt && (
                <Form operation="push-revoke" label="لغو این دستگاه">
                  <Hidden id={d.id} />
                </Form>
              )}
            </Card>
          ))
        ) : (
          <Empty text="دستگاهی ثبت نشده است." />
        )}
      </section>
    </div>
  );
}
export async function TicketsScreen({
  actor,
  manage = false,
  query = {},
}: {
  actor: Actor;
  manage?: boolean;
  query?: Query;
}) {
  const result = await ticketList(actor, {
    page: Number(query.page),
    status: query.status || undefined,
    category: query.category || undefined,
    manage,
  });
  const base = manage ? "/management/tickets" : "/requests";
  const href =
    base +
    "?" +
    new URLSearchParams({
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
    });
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <Heading
        title={manage ? "مدیریت درخواست‌ها" : "درخواست‌های من"}
        body="درخواست خصوصی شما فقط برای خودتان و مدیریت مجاز قابل مشاهده است."
      />
      {!manage && (
        <Link className="nav-extra bg-white text-primary" href="/requests/new">
          درخواست جدید
        </Link>
      )}
      <form className="grid gap-3 sm:grid-cols-3">
        <label className="field">
          فیلتر وضعیت
          <select name="status" defaultValue={query.status || ""}>
            <option value="">همه وضعیت‌ها</option>
            <Options values={ticketStatuses} />
          </select>
        </label>
        <label className="field">
          فیلتر دسته
          <select name="category" defaultValue={query.category || ""}>
            <option value="">همه دسته‌ها</option>
            <Options values={ticketCategories} />
          </select>
        </label>
        <button className="min-h-12 self-end rounded-xl bg-primary px-5 text-sm font-semibold text-white">
          اعمال فیلتر
        </button>
      </form>
      {result.rows.length ? (
        result.rows.map((t) => (
          <Card key={t.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="font-bold">
                درخواست {digits(t.number)} · {t.title}
              </h2>
              <Status status={t.status} />
            </div>
            <p className="my-3 text-xs text-secondary">
              {labels[t.category]} · {jalaliTime(t.updatedAt)}
            </p>
            <Link className="nav-extra text-primary" href={base + "/" + t.id}>
              مشاهده و پیگیری
            </Link>
          </Card>
        ))
      ) : (
        <Empty text="درخواستی در این فهرست وجود ندارد." />
      )}
      <Pagination page={result.page} total={result.total} href={href} />
    </div>
  );
}
export async function NewTicketScreen({ actor }: { actor: Actor }) {
  const options = await communicationOptions(actor);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Heading title="درخواست جدید" />
      <Card>
        <Form operation="ticket-create" label="ثبت درخواست">
          <input type="hidden" name="requestKey" value={randomUUID()} />
          <label className="field">
            عنوان درخواست
            <Input name="title" required minLength={3} maxLength={200} />
          </label>
          <Text name="description" label="شرح درخواست" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field">
              دسته درخواست
              <select name="category">
                <Options values={ticketCategories} />
              </select>
            </label>
            <label className="field">
              اولویت درخواست
              <select name="priority" defaultValue="NORMAL">
                <Options values={priorities} />
              </select>
            </label>
            <label className="field">
              واحد مرتبط (اختیاری)
              <select name="unitId">
                <option value="">مشاعات ساختمان</option>
                {options.units.map((u) => (
                  <option value={u.id} key={u.id}>
                    واحد {u.number}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <FileField />
        </Form>
      </Card>
    </div>
  );
}
export async function TicketDetailScreen({
  actor,
  id,
}: {
  actor: Actor;
  id: string;
}) {
  const t = await getTicket(actor, id);
  const options = t.manager ? await communicationOptions(actor) : null;
  const transitions = t.manager
    ? ticketTransitions[t.status] || []
    : ["RESOLVED", "CLOSED"].includes(t.status)
      ? ["REOPENED"]
      : [];
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <Heading title={"درخواست " + digits(t.number) + " · " + t.title} />
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <Status status={t.status} />
          <Status status={t.priority} />
          <Status status={t.category} />
        </div>
        <p className="whitespace-pre-wrap leading-8">{t.description}</p>
        <p className="mt-4 text-sm text-secondary">
          ثبت‌کننده: {t.creatorName} · مسئول پیگیری:{" "}
          {t.assignedName || "تعیین نشده"}
        </p>
        <AttachmentLinks attachments={t.attachments} />
      </Card>
      <section className="space-y-3" aria-label="گفت‌وگوی درخواست">
        <h2 className="text-lg font-bold">گفت‌وگو</h2>
        {t.comments.length ? (
          t.comments.map((c) => (
            <Card key={c.id}>
              <p className="mb-3 text-xs text-secondary">
                {c.authorName} · {jalaliTime(c.createdAt)}
              </p>
              <p className="whitespace-pre-wrap leading-8">{c.content}</p>
            </Card>
          ))
        ) : (
          <Empty text="هنوز پاسخی ثبت نشده است." />
        )}
      </section>
      {!["CLOSED", "RESOLVED"].includes(t.status) && (
        <Card>
          <Form operation="ticket-comment" label="ثبت پاسخ درخواست">
            <Hidden id={id} />
            <input type="hidden" name="requestKey" value={randomUUID()} />
            <Text name="content" label="متن پاسخ" max={5000} />
            <FileField />
          </Form>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {transitions.length > 0 && (
          <Card>
            <Form
              operation="ticket-status"
              label={t.manager ? "ثبت وضعیت درخواست" : "بازگشایی درخواست"}
            >
              <Hidden id={id} />
              <label className="field">
                وضعیت جدید
                <select name="status">
                  <Options values={transitions} />
                </select>
              </label>
              <label className="field">
                دلیل تغییر وضعیت
                <Input name="reason" required minLength={3} maxLength={500} />
              </label>
            </Form>
          </Card>
        )}
        {t.manager && options && (
          <Card>
            <Form operation="ticket-assign" label="ثبت مسئول پیگیری">
              <Hidden id={id} />
              <label className="field">
                مدیر مسئول
                <select name="userId" defaultValue={t.assignedToId || ""}>
                  <option value="">بدون مسئول</option>
                  {options.users
                    .filter((u) => u.manager)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </label>
            </Form>
          </Card>
        )}
      </div>
      <Card>
        <h2 className="mb-4 font-bold">تاریخچه درخواست</h2>
        <ol className="space-y-4">
          {t.events.map((e) => (
            <li
              key={e.id}
              className="border-b border-border pb-3 text-sm last:border-0"
            >
              <p>
                {e.reason} · <Status status={e.status} />
              </p>
              <p className="mt-2 text-xs text-secondary">
                {e.actorName} · {jalaliTime(e.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

export async function MeetingsScreen({
  actor,
  manage = false,
  query = {},
}: {
  actor: Actor;
  manage?: boolean;
  query?: Query;
}) {
  const result = await meetingList(actor, { page: Number(query.page), manage });
  const base = manage ? "/management/meetings" : "/meetings";
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <Heading
        title={manage ? "مدیریت جلسات" : "جلسات ساختمان"}
        body="زمان‌ها به تقویم شمسی و ساعت تهران نمایش داده می‌شوند."
      />
      {manage && (
        <div className="flex flex-wrap gap-3">
          <Link
            className="nav-extra bg-white text-primary"
            href={base + "/new"}
          >
            جلسه جدید
          </Link>
          <Link
            className="nav-extra bg-white text-primary"
            href="/management/resolutions"
          >
            مدیریت مصوبات
          </Link>
        </div>
      )}
      {result.rows.length ? (
        result.rows.map((m) => (
          <Card key={m.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="font-bold">{m.title}</h2>
              <Status status={m.status} />
            </div>
            <p className="my-3 text-sm text-secondary">
              {labels[m.kind]} · {jalaliTime(m.startsAt)}
            </p>
            <p className="text-sm">{m.location}</p>
            <Link
              className="nav-extra mt-3 text-primary"
              href={base + "/" + m.id}
            >
              جزئیات جلسه
            </Link>
          </Card>
        ))
      ) : (
        <Empty text="جلسه‌ای در این فهرست وجود ندارد." />
      )}
      <Pagination page={result.page} total={result.total} href={base} />
    </div>
  );
}
export async function MeetingEditor({
  actor,
  id,
}: {
  actor: Actor;
  id?: string;
}) {
  const m = id ? await getMeeting(actor, id) : null;
  const when = dateTimeFields(m?.startsAt || new Date());
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Heading title={m ? "ویرایش جلسه" : "جلسه جدید"} />
      <Card>
        <Form operation="meeting-save" label="ذخیره جلسه">
          {id && <Hidden id={id} />}
          <label className="field">
            عنوان جلسه
            <Input
              name="title"
              defaultValue={m?.title}
              required
              minLength={3}
              maxLength={200}
            />
          </label>
          <Text name="description" label="شرح جلسه" value={m?.description} />
          <Text name="agenda" label="دستور جلسه" value={m?.agenda} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field">
              نوع جلسه
              <select name="kind" defaultValue={m?.kind || "GENERAL"}>
                <Options values={["GENERAL", "OWNERS", "BOARD"]} />
              </select>
            </label>
            <label className="field">
              تاریخ جلسه شمسی
              <Input name="date" dir="ltr" defaultValue={when.date} required />
            </label>
            <label className="field">
              ساعت جلسه تهران
              <Input
                name="time"
                dir="ltr"
                defaultValue={when.time}
                required
                placeholder="18:30"
              />
            </label>
            <label className="field">
              محل جلسه
              <Input
                name="location"
                defaultValue={m?.location}
                required
                minLength={2}
                maxLength={300}
              />
            </label>
            <label className="field">
              پیوند جلسه آنلاین (اختیاری)
              <Input
                name="onlineUrl"
                type="url"
                dir="ltr"
                defaultValue={m?.onlineUrl || ""}
                placeholder="https://"
              />
            </label>
          </div>
          <FileField />
        </Form>
        <p className="mt-4 text-xs leading-6 text-secondary">
          مخاطبان بر اساس نوع جلسه از اعضای مجاز انتخاب می‌شوند. ثبت جلسه یا
          حضور به معنی احراز خودکار حد نصاب یا اعتبار حقوقی نیست.
        </p>
      </Card>
    </div>
  );
}
export async function MeetingDetailScreen({
  actor,
  id,
  manage = false,
}: {
  actor: Actor;
  id: string;
  manage?: boolean;
}) {
  const m = await getMeeting(actor, id);
  const resolutions = await resolutionsForMeeting(actor, id);
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <Heading title={m.title} />
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <Status status={m.kind} />
          <Status status={m.status} />
        </div>
        <p className="font-semibold">{jalaliTime(m.startsAt)}</p>
        <p className="my-3">{m.location}</p>
        {m.onlineUrl && (
          <a
            className="break-all text-sm text-primary underline"
            href={m.onlineUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            ورود به جلسه آنلاین
          </a>
        )}
        <p className="mt-4 whitespace-pre-wrap leading-8">{m.description}</p>
        <h2 className="mt-6 font-bold">دستور جلسه</h2>
        <p className="mt-3 whitespace-pre-wrap leading-8">{m.agenda}</p>
        <AttachmentLinks attachments={m.attachments} />
      </Card>
      {m.me && (
        <Card>
          <h2 className="mb-4 font-bold">دعوت و حضور من</h2>
          <p className="mb-3 text-sm">
            پاسخ دعوت: {labels[m.me.rsvp]} · حضور: {labels[m.me.attendance]}
          </p>
          {m.status === "SCHEDULED" && (
            <Form operation="meeting-rsvp" label="ثبت پاسخ دعوت">
              <Hidden id={id} />
              <label className="field">
                پاسخ من
                <select
                  name="rsvp"
                  defaultValue={m.me.rsvp === "NO" ? "NO" : "YES"}
                >
                  <Options values={["YES", "NO"]} />
                </select>
              </label>
            </Form>
          )}
        </Card>
      )}
      {manage && m.manager && (
        <div className="flex flex-wrap gap-3">
          {m.status === "SCHEDULED" &&
            !m.minutes.some((v) => v.status === "FINAL") && (
              <Link
                className="nav-extra bg-white text-primary"
                href={"/management/meetings/" + id + "/edit"}
              >
                ویرایش جلسه
              </Link>
            )}
          <Link
            className="nav-extra bg-white text-primary"
            href={"/management/meetings/" + id + "/minutes"}
          >
            ویرایش صورت‌جلسه
          </Link>
          <Link
            className="nav-extra bg-white text-primary"
            href={"/management/meetings/" + id + "/resolutions"}
          >
            ثبت و الحاقیه مصوبات
          </Link>
        </div>
      )}
      <section className="space-y-4">
        <h2 className="text-lg font-bold">صورت‌جلسه و نسخه‌ها</h2>
        {m.minutes.length ? (
          m.minutes.map((v) => (
            <Card key={v.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <h3 className="font-bold">نسخه {digits(v.version)}</h3>
                <Status status={v.status} />
              </div>
              <p className="mt-4 whitespace-pre-wrap leading-8">{v.content}</p>
              {v.amendmentReason && (
                <p className="mt-4 text-sm text-secondary">
                  دلیل الحاقیه: {v.amendmentReason}
                </p>
              )}
              <AttachmentLinks attachments={v.attachments} />
            </Card>
          ))
        ) : (
          <Empty text="صورت‌جلسه نهایی منتشر نشده است." />
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-bold">مصوبات جلسه</h2>
        {resolutions.length ? (
          resolutions.map((r) => (
            <Card key={r.id}>
              <h3 className="font-bold">مصوبه {digits(r.number)}</h3>
              {r.versions.map((v) => (
                <div key={v.id} className="mt-4 border-t border-border pt-4">
                  <p className="mb-3 text-sm">
                    نسخه {digits(v.version)} · <Status status={v.status} />
                  </p>
                  <p className="whitespace-pre-wrap leading-8">{v.content}</p>
                  <p className="mt-3 text-sm text-secondary">
                    مسئول اجرا: {v.responsibleName} · تصمیم{" "}
                    {jalaliTime(v.decisionAt)} · اثر {jalaliTime(v.effectiveAt)}
                  </p>
                  {v.amendmentReason && (
                    <p className="mt-3 text-sm">
                      دلیل الحاقیه: {v.amendmentReason}
                    </p>
                  )}
                  <AttachmentLinks attachments={v.attachments} />
                </div>
              ))}
            </Card>
          ))
        ) : (
          <Empty text="مصوبه‌ای منتشر نشده است." />
        )}
      </section>
      {manage && m.manager && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold">دعوت‌شدگان و حضور</h2>
          {m.participants.map((p) => (
            <Card key={p.userId}>
              <h3 className="font-bold">{p.name}</h3>
              <p className="my-3 text-sm">
                دعوت: {labels[p.rsvp]} · حضور: {labels[p.attendance]}
              </p>
              {m.startsAt <= new Date() && m.status !== "CANCELLED" && (
                <Form
                  operation="meeting-attendance"
                  label="ثبت حضور شرکت‌کننده"
                >
                  <Hidden id={id} />
                  <input type="hidden" name="userId" value={p.userId} />
                  <label className="field">
                    حضور شرکت‌کننده
                    <select
                      name="attendance"
                      defaultValue={
                        p.attendance === "ABSENT" ? "ABSENT" : "PRESENT"
                      }
                    >
                      <Options values={["PRESENT", "ABSENT"]} />
                    </select>
                  </label>
                  <label className="field">
                    دلیل ثبت یا اصلاح حضور
                    <Input
                      name="reason"
                      required
                      minLength={3}
                      defaultValue="ثبت حضور جلسه"
                    />
                  </label>
                </Form>
              )}
            </Card>
          ))}
        </section>
      )}
      {manage && m.status === "SCHEDULED" && (
        <Card>
          <Form operation="meeting-status" label="ثبت وضعیت جلسه">
            <Hidden id={id} />
            <label className="field">
              وضعیت جلسه
              <select name="status">
                <Options values={["COMPLETED", "CANCELLED"]} />
              </select>
            </label>
            <label className="field">
              دلیل تغییر جلسه
              <Input name="reason" required minLength={3} />
            </label>
          </Form>
        </Card>
      )}
      <p className="text-xs leading-6 text-secondary">
        این اطلاعات، ثبت مدیریتی ساختمان است و به‌تنهایی اثبات حد نصاب، سمت
        ریاست یا اعتبار حقوقی تصمیم نیست.
      </p>
    </div>
  );
}
export async function MinutesEditor({
  actor,
  id,
}: {
  actor: Actor;
  id: string;
}) {
  const m = await getMeeting(actor, id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Heading title="صورت‌جلسه و الحاقیه" body={m.title} />
      {m.status !== "CANCELLED" && (
        <Card>
          <Form operation="minutes" label="ثبت نسخه صورت‌جلسه">
            <Hidden id={id} />
            <Text
              name="content"
              label="متن صورت‌جلسه"
              value={m.minutes[0]?.content}
              max={20000}
            />
            <label className="field">
              وضعیت نسخه
              <select name="status">
                <Options values={["DRAFT", "FINAL"]} />
              </select>
            </label>
            <label className="field">
              دلیل الحاقیه صورت‌جلسه
              <Input
                name="reason"
                minLength={3}
                required={m.minutes.some((v) => v.status === "FINAL")}
                maxLength={500}
              />
            </label>
            <FileField />
          </Form>
          <p className="mt-4 text-xs leading-6 text-secondary">
            هر ثبت، نسخه جدیدی می‌سازد. متن نهایی قبلی حذف یا بازنویسی نمی‌شود.
          </p>
        </Card>
      )}
      <Link
        className="nav-extra text-primary"
        href={"/management/meetings/" + id}
      >
        بازگشت به جلسه و نسخه‌ها
      </Link>
    </div>
  );
}
export async function ResolutionsScreen({
  actor,
  id,
}: {
  actor: Actor;
  id: string;
}) {
  const [m, records, options] = await Promise.all([
    getMeeting(actor, id),
    resolutionsForMeeting(actor, id),
    communicationOptions(actor),
  ]);
  const editor = (record?: (typeof records)[number]) => {
    const last = record?.versions[0];
    return (
      <Card key={record?.id || "new"}>
        <h2 className="mb-4 font-bold">
          {record ? "الحاقیه مصوبه " + digits(record.number) : "مصوبه جدید"}
        </h2>
        <Form
          operation="resolution"
          label={
            record
              ? "ثبت الحاقیه مصوبه " + digits(record.number)
              : "ثبت مصوبه جدید"
          }
        >
          <input type="hidden" name="meetingId" value={id} />
          {record && <Hidden id={record.id} />}
          <Text name="content" label="متن مصوبه" value={last?.content} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field">
              وضعیت مصوبه
              <select name="status" defaultValue={last?.status || "DRAFT"}>
                <Options
                  values={[
                    "DRAFT",
                    "PUBLISHED",
                    "IN_PROGRESS",
                    "COMPLETED",
                    "CANCELLED",
                  ]}
                />
              </select>
            </label>
            <label className="field">
              مسئول اجرای مصوبه
              <select name="responsibleId" defaultValue={last?.responsibleId}>
                {options.users.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              تاریخ تصمیم شمسی
              <Input
                name="decisionDate"
                dir="ltr"
                required
                defaultValue={jalaliInput(last?.decisionAt || new Date())}
              />
            </label>
            <label className="field">
              تاریخ اثر شمسی
              <Input
                name="effectiveDate"
                dir="ltr"
                required
                defaultValue={jalaliInput(last?.effectiveAt || new Date())}
              />
            </label>
          </div>
          <label className="field">
            دلیل الحاقیه مصوبه
            <Input
              name="reason"
              minLength={3}
              maxLength={500}
              required={record?.versions.some((v) => v.status !== "DRAFT")}
            />
          </label>
          <FileField />
        </Form>
        {record && (
          <p className="mt-4 text-xs text-secondary">
            {digits(record.versions.length)} نسخه محفوظ است؛ سابقه نسخه‌ها در
            صفحه جلسه نمایش داده می‌شود.
          </p>
        )}
      </Card>
    );
  };
  return (
    <div className="space-y-6">
      <Heading title="مدیریت مصوبات" body={m.title} />
      {m.status !== "CANCELLED" && editor()}
      {records.map((r) => editor(r))}
      <Link
        className="nav-extra text-primary"
        href={"/management/meetings/" + id}
      >
        مشاهده جلسه و تاریخچه مصوبات
      </Link>
    </div>
  );
}
export async function OverviewScreen({ actor }: { actor: Actor }) {
  const data = await communicationOverview(actor);
  const items = [
    { label: "اطلاعیه منتشرشده", value: data.announcements },
    { label: "انتشار زمان‌بندی‌شده", value: data.scheduled },
    { label: "درخواست باز", value: data.tickets },
    { label: "جلسه پیش رو", value: data.meetings },
    { label: "ارسال در انتظار", value: data.queued },
    { label: "ارسال ناموفق نهایی", value: data.failed },
    { label: "ارسال با نتیجه نامشخص", value: data.unconfirmed },
  ];
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <Heading title="ارتباطات و پیگیری ساختمان" />
      <div className="flex flex-wrap gap-3">
        {[
          { href: "announcements", text: "مدیریت اطلاعیه‌ها" },
          { href: "tickets", text: "مدیریت درخواست‌ها" },
          { href: "meetings", text: "مدیریت جلسات" },
          { href: "resolutions", text: "مدیریت مصوبات" },
          { href: "communications/deliveries", text: "تاریخچه ارسال اعلان" },
        ].map((a) => (
          <Link
            className="nav-extra bg-white text-primary"
            key={a.href}
            href={"/management/" + a.href}
          >
            {a.text}
          </Link>
        ))}
      </div>
      <dl className="grid gap-5 rounded-2xl border border-border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-sm text-secondary">{item.label}</dt>
            <dd className="mt-2 text-2xl font-bold">{digits(item.value)}</dd>
          </div>
        ))}
      </dl>
      <Card>
        <Form
          operation="financial-reminders"
          label="بررسی یادآوری سررسید شارژ"
        />
        <p className="mt-3 text-xs text-secondary">
          یادآوری‌ها از صورتحساب واقعی ساخته می‌شوند؛ کلید رویداد از ارسال
          تکراری جلوگیری می‌کند.
        </p>
      </Card>
      <Card>
        <h2 className="mb-4 font-bold">عملیات نیازمند بررسی</h2>
        {data.deadJobs.length ? (
          data.deadJobs.map((j) => (
            <p className="py-3 text-sm" key={j.id}>
              {j.lastError} · تعداد تلاش {digits(j.attempts)}
            </p>
          ))
        ) : (
          <p className="text-sm text-secondary">
            عملیات متوقف‌شده‌ای ثبت نشده است.
          </p>
        )}
        <p className="mt-3 text-xs text-secondary">
          نتیجه نامشخص پس از قطع ارتباط، خودکار دوباره ارسال نمی‌شود تا پیام
          تکراری ایجاد نشود.
        </p>
      </Card>
      <Card>
        <h2 className="mb-4 font-bold">تاریخچه ارتباطات</h2>
        {data.audits.length ? (
          data.audits.map((a) => (
            <div
              className="border-b border-border py-3 text-xs last:border-0"
              key={a.id}
            >
              <p>{a.action}</p>
              <p className="mt-2 text-secondary">
                {jalaliTime(a.createdAt)} · {a.actorId || "پردازش سامانه"}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-secondary">رویدادی ثبت نشده است.</p>
        )}
      </Card>
    </div>
  );
}
export async function DeliveriesScreen({
  actor,
  query = {},
}: {
  actor: Actor;
  query?: Query;
}) {
  const result = await deliveryHistory(actor, Number(query.page), query.status);
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <Heading
        title="تاریخچه ارسال اعلان"
        body="صف ارسال به معنی ارسال نیست؛ پذیرش سرویس به معنی تحویل به گوشی نیست. نتیجهٔ نامشخص نیازمند بررسی است. پیامک توسعه ارسال واقعی نیست."
      />
      <form className="flex flex-wrap items-end gap-3">
        <label className="field">
          وضعیت ارسال
          <select name="status" defaultValue={query.status || ""}>
            <option value="">همه وضعیت‌ها</option>
            <Options
              values={[
                "PENDING",
                "SENDING",
                "DELIVERED",
                "ACCEPTED",
                "SIMULATED",
                "SKIPPED",
                "FAILED",
                "UNKNOWN",
              ]}
            />
          </select>
        </label>
        <button className="min-h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-white">
          فیلتر ارسال
        </button>
      </form>
      {result.rows.length ? (
        result.rows.map((d) => (
          <Card key={d.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="font-bold">{d.notification.title}</h2>
              <Status status={d.status} />
            </div>
            <p className="my-3 text-sm">
              {d.recipientName} · {labels[d.channel]} · {digits(d.attempts)}{" "}
              تلاش
            </p>
            {d.smsEventKey && (
              <p dir="ltr" className="my-2 break-all text-xs text-secondary">
                {d.smsEventKey}
              </p>
            )}
            {d.lastError && (
              <p className="text-sm text-secondary">
                {labels[d.lastError] || "نیازمند بررسی سرویس"}
              </p>
            )}
            {d.logs.map((log) => (
              <p key={log.id} className="mt-3 text-xs text-secondary">
                تلاش {digits(log.number)} · {labels[log.status] || log.status} ·{" "}
                {jalaliTime(log.startedAt)}
              </p>
            ))}
            {d.providerMessageId && (
              <p className="mt-3 break-all text-xs text-secondary">
                مرجع سرویس: {d.providerMessageId}
              </p>
            )}
          </Card>
        ))
      ) : (
        <Empty text="ارسالی در این فهرست وجود ندارد." />
      )}
      <Pagination
        page={result.page}
        total={result.total}
        href={
          "/management/communications/deliveries" +
          (query.status ? "?status=" + encodeURIComponent(query.status) : "")
        }
      />
    </div>
  );
}

export async function ResolutionIndexScreen({
  actor,
  query = {},
}: {
  actor: Actor;
  query?: Query;
}) {
  const result = await resolutionIndex(actor, Number(query.page || 1));
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <Heading
        title="مدیریت مصوبات"
        body="مصوبه نهایی بازنویسی نمی‌شود؛ تغییرات با الحاقیه و دلیل ثبت می‌شوند."
      />
      <Link
        className="nav-extra bg-white text-primary"
        href="/management/meetings"
      >
        انتخاب جلسه برای مصوبه جدید
      </Link>
      {result.rows.length ? (
        result.rows.map((r) => (
          <Card key={r.id}>
            <h2 className="font-bold">
              مصوبه {digits(r.number)} · {r.meetingTitle}
            </h2>
            {r.versions[0] && (
              <>
                <div className="my-3">
                  <Status status={r.versions[0].status} />
                </div>
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {r.versions[0].content}
                </p>
              </>
            )}
            <Link
              className="nav-extra mt-3 text-primary"
              href={"/management/meetings/" + r.meetingId + "/resolutions"}
            >
              مدیریت نسخه‌ها و الحاقیه
            </Link>
          </Card>
        ))
      ) : (
        <Empty text="مصوبه‌ای ثبت نشده است." />
      )}
      <Pagination
        page={result.page}
        total={result.total}
        href="/management/resolutions"
      />
    </div>
  );
}
