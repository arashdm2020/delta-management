"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Counts = { inbox: number; notifications: number };
const MailCounts = createContext<Counts>({ inbox: 0, notifications: 0 });
export const useMailCounts = () => useContext(MailCounts);
export function MailCountsProvider({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial: Counts;
}) {
  const [counts, setCounts] = useState(initial);
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    const source = new EventSource("/api/inbox/events");
    let previous: string | undefined;
    source.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as Counts;
        if (
          !Number.isInteger(next.inbox) ||
          !Number.isInteger(next.notifications)
        )
          return;
        setCounts(next);
        if (
          previous !== undefined &&
          previous !== event.data &&
          (path.startsWith("/inbox") || path === "/notifications")
        )
          router.refresh();
        previous = event.data;
      } catch {
        /* Reconnect preserves the last valid counts. */
      }
    };
    return () => source.close();
  }, [path, router]);
  return <MailCounts.Provider value={counts}>{children}</MailCounts.Provider>;
}
export function MailBadge() {
  const { inbox } = useMailCounts();
  return inbox > 0 ? (
    <span
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white"
      aria-label={inbox + " پیام خوانده‌نشده"}
    >
      {new Intl.NumberFormat("fa-IR").format(inbox)}
    </span>
  ) : null;
}
