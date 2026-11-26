"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function InboxLink({
  initialNotifications,
}: {
  initialNotifications: number;
}) {
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState(initialNotifications);
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    const source = new EventSource("/api/inbox/events");
    let previous: string | undefined;
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as {
        inbox: number;
        notifications: number;
      };
      setCount(next.inbox);
      setNotifications(next.notifications);
      if (
        previous !== undefined &&
        previous !== event.data &&
        (path === "/inbox" || path === "/notifications")
      )
        router.refresh();
      previous = event.data;
    };
    return () => source.close();
  }, [path, router]);
  return (
    <>
      <Link className="nav-extra whitespace-nowrap" href="/inbox">
        پیام‌ها {count > 0 && <span>({count})</span>}
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
