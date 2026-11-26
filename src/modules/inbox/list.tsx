import Link from "next/link";
import { Mail, MailOpen, ArrowUpLeft, Search } from "lucide-react";
import type { Actor } from "@/lib/security/core";
import { mailbox } from "./queries";
import { jalaliTime } from "@/lib/dates";
import { digits } from "@/lib/utils";

export async function MailboxList({
  actor,
  direction,
  query,
}: {
  actor: Actor;
  direction: "received" | "sent";
  query: { q?: string; filter?: string; page?: string };
}) {
  const data = await mailbox(actor, direction, query);
  const sent = direction === "sent";
  const path = sent ? "/inbox/sent" : "/inbox";
  function pageHref(page: number) {
    const search = new URLSearchParams({
      page: String(page),
      q: data.q,
      filter: data.filter || "all",
    });
    return path + "?" + search;
  }
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">
          {sent ? "صندوق خروجی" : "صندوق ورودی"}
        </h2>
        <span className="text-sm text-secondary">
          {digits(data.total)} پیام
        </span>
      </div>
      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="field min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <Search size={15} />
            جستجو در پیام‌ها
          </span>
          <input
            className="min-h-11 w-full rounded-xl border border-input bg-white px-3"
            name="q"
            maxLength={100}
            defaultValue={data.q}
            placeholder="موضوع، متن، نام یا واحد"
          />
        </label>
        <label className="field">
          وضعیت
          <select
            name="filter"
            defaultValue={data.filter}
            className="min-h-11 rounded-xl border border-input bg-white px-3"
          >
            <option value="all">همه پیام‌ها</option>
            <option value="unread">خوانده‌نشده</option>
            <option value="read">خوانده‌شده</option>
          </select>
        </label>
        <button className="min-h-11 rounded-xl bg-primary px-5 font-medium text-white">
          جستجو
        </button>
      </form>
      {!data.rows.length ? (
        <div className="rounded-2xl border border-border bg-white px-6 py-12 text-center">
          <Mail size={32} className="mx-auto mb-3 text-primary" />
          <p className="font-bold">
            {data.q || data.filter !== "all"
              ? "پیامی با این شرایط پیدا نشد."
              : sent
                ? "هنوز پیامی ارسال نکرده‌اید."
                : "صندوق ورودی خالی است."}
          </p>
          <Link
            href="/inbox/compose"
            className="mt-4 inline-flex min-h-11 items-center text-primary underline"
          >
            ارسال پیام جدید
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-right text-sm">
              <caption className="sr-only">
                {sent ? "پیام‌های ارسال‌شده" : "پیام‌های دریافتی"}
              </caption>
              <thead className="border-b border-border bg-soft text-secondary">
                <tr>
                  <th scope="col" className="p-3">
                    وضعیت
                  </th>
                  <th scope="col" className="p-3">
                    {sent ? "گیرنده" : "فرستنده"}
                  </th>
                  <th scope="col" className="p-3">
                    {sent ? "واحد / گروه" : "سمت / واحد"}
                  </th>
                  <th scope="col" className="p-3">
                    موضوع و پیش‌نمایش
                  </th>
                  <th scope="col" className="p-3">
                    تاریخ و ساعت
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const person = data.people.get(
                    sent ? row.recipientId : row.senderId,
                  );
                  const unread = !row.readAt;
                  return (
                    <tr
                      key={row.id}
                      className={
                        "border-b border-border last:border-0 hover:bg-soft/60 " +
                        (!sent && unread ? "bg-blue-50/50" : "")
                      }
                    >
                      <td className="p-3">
                        <span className="flex items-center gap-1.5 text-xs">
                          {unread ? (
                            <Mail size={16} className="text-primary" />
                          ) : (
                            <MailOpen size={16} className="text-secondary" />
                          )}
                          {unread ? "خوانده‌نشده" : "خوانده‌شده"}
                        </span>
                      </td>
                      <td
                        className={
                          "p-3 " + (!sent && unread ? "font-bold" : "")
                        }
                      >
                        {person?.name || "عضو ساختمان"}
                      </td>
                      <td className="p-3 text-xs text-secondary">
                        {sent
                          ? row.audienceLabel || person?.detail
                          : person?.detail}
                      </td>
                      <td className="max-w-md p-3">
                        <Link
                          href={"/inbox/thread/" + row.threadId}
                          className={
                            "block min-h-10 text-primary " +
                            (!sent && unread ? "font-bold" : "font-medium")
                          }
                        >
                          {row.subject || "بدون موضوع"}
                          <ArrowUpLeft size={14} className="mr-1 inline" />
                        </Link>
                        <p className="line-clamp-1 max-w-sm text-xs text-secondary">
                          {row.body}
                        </p>
                      </td>
                      <td className="whitespace-nowrap p-3 text-xs text-secondary">
                        {jalaliTime(row.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-border md:hidden">
            {data.rows.map((row) => {
              const person = data.people.get(
                sent ? row.recipientId : row.senderId,
              );
              return (
                <li
                  key={row.id}
                  className={!sent && !row.readAt ? "bg-blue-50/50" : ""}
                >
                  <Link
                    className="block space-y-2 p-4"
                    href={"/inbox/thread/" + row.threadId}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={!row.readAt ? "font-bold" : "font-medium"}
                      >
                        {person?.name || "عضو ساختمان"}
                      </span>
                      <span className="text-xs text-secondary">
                        {row.readAt ? "خوانده‌شده" : "خوانده‌نشده"}
                      </span>
                    </div>
                    <p className="text-xs text-secondary">
                      {sent
                        ? row.audienceLabel || person?.detail
                        : person?.detail}
                    </p>
                    <p className="font-bold text-primary">
                      {row.subject || "بدون موضوع"}
                    </p>
                    <p className="line-clamp-2 break-words text-sm text-secondary">
                      {row.body}
                    </p>
                    <p className="text-xs text-secondary">
                      {jalaliTime(row.createdAt)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {data.total > 20 && (
        <nav
          aria-label="صفحه‌بندی پیام‌ها"
          className="flex items-center justify-between gap-3 text-sm"
        >
          {data.page > 1 ? (
            <Link className="nav-extra bg-white" href={pageHref(data.page - 1)}>
              صفحه قبل
            </Link>
          ) : (
            <span />
          )}
          <span>
            {digits(data.page)} از{" "}
            {digits(Math.max(1, Math.ceil(data.total / 20)))}
          </span>
          {data.page * 20 < data.total ? (
            <Link className="nav-extra bg-white" href={pageHref(data.page + 1)}>
              صفحه بعد
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
