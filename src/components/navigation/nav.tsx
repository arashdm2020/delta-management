"use client";
import { MailBadge } from "@/modules/inbox/counts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Wallet,
  MessagesSquare,
  ClipboardList,
  UserRound,
  Building2,
  UsersRound,
  ShieldCheck,
  ScrollText,
  LayoutDashboard,
  Settings,
  PanelTop,
} from "lucide-react";
const resident = [
  { href: "/home", label: "خانه", icon: Home },
  { href: "/charges", label: "شارژ", icon: Wallet },
  { href: "/inbox", label: "پیام‌ها", icon: MessagesSquare },
  { href: "/announcements", label: "اطلاعیه‌ها", icon: MessagesSquare },
  { href: "/requests", label: "درخواست‌ها", icon: ClipboardList },
  { href: "/profile", label: "پروفایل", icon: UserRound },
];
const management = [
  { href: "/inbox", label: "صندوق پیام‌ها", icon: MessagesSquare },
  {
    href: "/management/communications",
    label: "ارتباطات",
    icon: MessagesSquare,
  },
  {
    href: "/management/announcements",
    label: "اطلاعیه‌ها",
    icon: MessagesSquare,
  },
  { href: "/management/tickets", label: "درخواست‌ها", icon: ClipboardList },
  { href: "/management/meetings", label: "جلسات", icon: UsersRound },
  { href: "/management/finance", label: "امور مالی", icon: Wallet },
  { href: "/management/expenses", label: "هزینه‌ها", icon: ClipboardList },
  { href: "/management", label: "نمای کلی", icon: LayoutDashboard },
  { href: "/management/units", label: "واحدها", icon: Building2 },
  { href: "/management/users", label: "کاربران و تأیید", icon: UsersRound },
  { href: "/management/board", label: "هیئت‌مدیره", icon: ShieldCheck },
  { href: "/management/building", label: "اطلاعات ساختمان", icon: PanelTop },
  { href: "/management/audit", label: "تاریخچه فعالیت", icon: ScrollText },
];
export function Navigation({
  mode = "resident",
  mobile = false,
}: {
  mode?: "resident" | "management";
  mobile?: boolean;
}) {
  const path = usePathname();
  const items =
    mode === "management"
      ? management
      : mobile
        ? resident.filter((item) => item.href !== "/announcements")
        : resident;
  const isActive = (href: string) =>
    path === href || (href !== "/management" && path.startsWith(href + "/"));
  return (
    <nav
      aria-label={mode === "management" ? "منوی مدیریت" : "ناوبری اصلی"}
      className={
        mobile
          ? "bottom-nav md:hidden"
          : mode === "management"
            ? "flex flex-wrap gap-2 pb-2"
            : "grid gap-2"
      }
    >
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={
            (mobile
              ? "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] "
              : mode === "management"
                ? "flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm "
                : "flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm ") +
            (isActive(href)
              ? "bg-soft font-semibold text-primary"
              : "text-secondary hover:bg-soft/70")
          }
        >
          <Icon size={mobile ? 20 : 19} aria-hidden />
          <span className="inline-flex items-center gap-2">
            {label}
            {href === "/inbox" && <MailBadge />}
          </span>
        </Link>
      ))}
    </nav>
  );
}
export function DesktopExtra({ manager }: { manager: boolean }) {
  const path = usePathname();
  return (
    <div className="mt-6 space-y-2 border-t border-border pt-5">
      <Link
        aria-current={
          path === "/units" || path.startsWith("/units/") ? "page" : undefined
        }
        className="nav-extra"
        href="/units"
      >
        <Building2 size={18} />
        واحدهای من
      </Link>
      <Link className="nav-extra" href="/meetings">
        جلسات ساختمان
      </Link>
      <Link className="nav-extra" href="/notifications">
        مرکز اعلان‌ها
      </Link>
      <Link
        aria-current={path === "/settings" ? "page" : undefined}
        className="nav-extra"
        href="/settings"
      >
        <Settings size={18} />
        تنظیمات برنامه
      </Link>
      {manager && (
        <Link
          aria-current={path.startsWith("/management") ? "page" : undefined}
          className={
            "nav-extra " +
            (path.startsWith("/management") ? "bg-soft text-primary" : "")
          }
          href="/management"
        >
          <ShieldCheck size={18} />
          منوی مدیریت
        </Link>
      )}
      <Link className="nav-extra" href="/settings#install">
        راهنمای نصب برنامه
      </Link>
    </div>
  );
}
