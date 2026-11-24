import Link from "next/link";
import { Bell, Building2, ShieldCheck, ChevronLeft } from "lucide-react";
import { Navigation, DesktopExtra } from "@/components/navigation/nav";
import { jalali } from "@/lib/dates";
import { canManage, type Actor } from "@/lib/security/core";
export async function Shell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: Actor & { name: string | null };
}) {
  const manager = canManage(user);
  const { unreadCount } = await import("@/modules/notifications/service");
  const unread = await unreadCount(user);
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3"
      >
        پرش به محتوا
      </a>
      <aside className="fixed inset-y-0 right-0 hidden w-64 flex-col overflow-y-auto border-l border-border bg-white p-5 md:flex">
        <Link href="/home" className="mb-10 flex items-center gap-3 px-2">
          <span className="grid size-11 place-items-center rounded-xl bg-soft text-primary">
            <Building2 />
          </span>
          <span>
            <b className="block">ساختمان دلتا</b>
            <small className="text-secondary">
              آرامش در مدیریت، نظم در زندگی
            </small>
          </span>
        </Link>
        <Navigation />
        <DesktopExtra manager={manager} />
        <p className="mt-auto px-4 pt-8 text-xs leading-6 text-secondary">
          مدیریت اختصاصی ساختمان دلتا
          <br />
          اردبیل · نسخهٔ پایه
        </p>
      </aside>
      <div className="md:mr-64">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-6 sm:px-8">
          <Link href="/home" className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-white text-primary md:hidden">
              <Building2 />
            </span>
            <span>
              <span className="block text-xs text-secondary">
                سامانه مدیریت ساختمان
              </span>
              <strong className="mt-1 block text-lg">ساختمان دلتا</strong>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-secondary sm:block">
              {jalali(new Date())}
            </span>
            <Link
              aria-label={"مرکز اعلان‌ها، " + unread + " خوانده‌نشده"}
              href="/notifications"
              className="relative grid size-11 place-items-center rounded-full bg-white text-primary"
            >
              <Bell size={19} />
              {unread > 0 && (
                <span
                  data-testid="unread-badge"
                  className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-center text-[10px] text-white"
                >
                  {new Intl.NumberFormat("fa-IR").format(unread)}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto max-w-6xl px-5 pb-32 sm:px-8 md:pb-12"
        >
          {manager && (
            <Link
              href="/management"
              className="mb-5 flex w-fit items-center gap-2 rounded-full border border-primary/15 bg-white px-4 py-2 text-xs text-primary md:hidden"
            >
              <ShieldCheck size={15} />
              منوی مدیریت
              <ChevronLeft size={14} />
            </Link>
          )}
          {children}
        </main>
      </div>
      <Navigation mobile />
    </div>
  );
}
