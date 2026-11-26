"use client";
import { Bell, Mail } from "lucide-react";
import Link from "next/link";
import { MailBadge, useMailCounts } from "./counts";
export function InboxLink({
  initialNotifications,
}: {
  initialNotifications: number;
}) {
  const { notifications } = useMailCounts();
  void initialNotifications;
  return (
    <>
      <Link
        className="nav-extra flex items-center gap-2 whitespace-nowrap"
        href="/inbox"
        aria-label="صندوق پیام‌ها"
      >
        <Mail size={19} />
        <MailBadge />
      </Link>
      <Link
        className="relative grid size-11 place-items-center rounded-full bg-white text-primary"
        href="/notifications"
        aria-label={"مرکز اعلان‌ها، " + notifications + " خوانده‌نشده"}
      >
        <Bell size={19} />
        {notifications > 0 && (
          <span
            data-testid="unread-badge"
            className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-center text-[10px] text-white"
          >
            {new Intl.NumberFormat("fa-IR").format(notifications)}
          </span>
        )}
      </Link>
    </>
  );
}
