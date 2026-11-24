"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-md p-10 text-center">
      <h1 className="page-heading">ارتباط با سامانه برقرار نشد</h1>
      <p className="page-description mb-6">
        اتصال یا دسترسی به پایگاه داده را بررسی و دوباره تلاش کنید. جزئیات خصوصی
        خطا نمایش داده نمی‌شود.
      </p>
      <Button onClick={reset}>تلاش دوباره</Button>
    </main>
  );
}
