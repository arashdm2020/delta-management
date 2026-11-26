import { Suspense } from "react";
import { MailboxNav } from "@/modules/inbox/nav";
export default function MailboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <h1 className="page-heading">پیام‌ها</h1>
      <Suspense>
        <MailboxNav />
      </Suspense>
      {children}
    </div>
  );
}
