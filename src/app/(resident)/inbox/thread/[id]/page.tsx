import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireApproved } from "@/modules/auth/session";
import { privateThread } from "@/modules/inbox/queries";
import { privateRecord } from "@/modules/notifications/read-boundary";
import { InboxForm } from "@/modules/inbox/form";
import { ReadThread } from "@/modules/inbox/read-thread";
import { jalaliTime } from "@/lib/dates";
import { digits } from "@/lib/utils";

export default async function Thread({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await requireApproved(),
    { id } = await params;
  const { page } = await searchParams;
  const data = await privateRecord(() => privateThread(actor, id, page));
  const sender = data.people.get(data.root.senderId);
  const recipient = data.people.get(data.root.recipientId);
  return (
    <section className="space-y-5">
      {data.rows.some((row) => row.recipientId === actor.id && !row.readAt) && (
        <ReadThread id={id} />
      )}
      <Link
        href="/inbox"
        className="inline-flex min-h-11 items-center text-sm text-primary underline"
      >
        بازگشت به صندوق پیام‌ها
      </Link>
      <header className="space-y-3 rounded-2xl border border-border bg-white p-5">
        <h2 className="break-words text-xl font-bold">
          {data.root.subject || "بدون موضوع"}
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-secondary">فرستنده</dt>
            <dd className="mt-1 font-medium">
              {sender?.name} · {sender?.detail}
            </dd>
          </div>
          <div>
            <dt className="text-secondary">گیرنده</dt>
            <dd className="mt-1 font-medium">
              {recipient?.name} · {data.root.audienceLabel || recipient?.detail}
            </dd>
          </div>
        </dl>
      </header>
      <ol aria-label="تاریخچه مکالمه" className="space-y-4">
        {data.rows.map((row) => {
          const own = row.senderId === actor.id;
          const person = data.people.get(row.senderId);
          return (
            <li
              key={row.id}
              className={"flex " + (own ? "justify-start" : "justify-end")}
            >
              <article
                className={
                  "w-full max-w-2xl rounded-2xl border p-4 sm:p-5 " +
                  (own ? "border-primary/15 bg-soft" : "border-border bg-white")
                }
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold">
                    {person?.name} · {own ? "شما" : "دریافتی"}
                  </span>
                  <time
                    className="text-secondary"
                    dateTime={row.createdAt.toISOString()}
                  >
                    {jalaliTime(row.createdAt)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-8">
                  {row.body}
                </p>
                {own && (
                  <p className="mt-3 text-xs text-secondary">
                    {row.readAt
                      ? "خوانده‌شده · " + jalaliTime(row.readAt)
                      : "هنوز خوانده نشده"}
                  </p>
                )}
              </article>
            </li>
          );
        })}
      </ol>
      {data.pages > 1 && (
        <nav
          aria-label="صفحه‌بندی مکالمه"
          className="flex justify-between text-sm"
        >
          {data.page > 1 ? (
            <Link
              href={`/inbox/thread/${id}?page=${data.page - 1}`}
              className="nav-extra bg-white"
            >
              پیام‌های قدیمی‌تر
            </Link>
          ) : (
            <span />
          )}
          <span>
            {digits(data.page)} از {digits(data.pages)}
          </span>
          {data.page < data.pages ? (
            <Link
              href={`/inbox/thread/${id}?page=${data.page + 1}`}
              className="nav-extra bg-white"
            >
              پیام‌های جدیدتر
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
      <section className="rounded-2xl border border-border bg-white p-5">
        <h3 className="mb-4 font-bold">
          پاسخ به{" "}
          {
            data.people.get(
              data.root.senderId === actor.id
                ? data.root.recipientId
                : data.root.senderId,
            )?.name
          }
        </h3>
        <InboxForm className="grid gap-4">
          <input type="hidden" name="requestId" value={randomUUID()} />
          <input type="hidden" name="thread" value={id} />
          <label className="field">
            متن پاسخ
            <textarea
              name="body"
              required
              maxLength={4000}
              rows={4}
              className="w-full rounded-xl border border-input p-3 focus:outline-2 focus:outline-primary"
            />
          </label>
        </InboxForm>
      </section>
    </section>
  );
}
