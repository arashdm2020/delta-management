"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Inbox, Send, MailPlus, Mail } from "lucide-react";
import { MailBadge } from "./counts";
export function MailboxNav() {
  const path = usePathname(),
    params = useSearchParams();
  const unread = params.get("filter") === "unread" && path === "/inbox";
  return (
    <nav
      aria-label="صندوق پیام‌ها"
      className="flex flex-wrap items-center gap-2 border-b border-border pb-4"
    >
      <Link
        href="/inbox/compose"
        className="mr-0 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-medium text-white"
      >
        <MailPlus size={18} />
        پیام جدید
      </Link>
      {[
        {
          href: "/inbox",
          label: "صندوق ورودی",
          Icon: Inbox,
          active: path === "/inbox" && !unread,
        },
        {
          href: "/inbox/sent",
          label: "صندوق خروجی",
          Icon: Send,
          active: path === "/inbox/sent",
        },
        {
          href: "/inbox?filter=unread",
          label: "خوانده‌نشده",
          Icon: Mail,
          active: unread,
        },
      ].map(({ href, label, Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={
            "inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm " +
            (active
              ? "bg-soft font-bold text-primary"
              : "text-secondary hover:bg-white")
          }
        >
          <Icon size={18} />
          {label}
          {href === "/inbox" && <MailBadge />}
        </Link>
      ))}
    </nav>
  );
}
