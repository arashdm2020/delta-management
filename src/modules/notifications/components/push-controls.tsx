"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function PushControls({ configured }: { configured: boolean }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function enable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (!configured) throw new Error("ارسال Push پیکربندی نشده است.");
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      )
        throw new Error(
          "این مرورگر از Push پشتیبانی نمی‌کند. در آیفون از نسخه پشتیبانی‌شده برنامه نصب‌شده روی صفحه اصلی استفاده کنید.",
        );
      const form = new FormData(event.currentTarget);
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "مجوز اعلان داده نشد؛ می‌توانید تنظیمات مرورگر را بررسی کنید.",
        );
      const config = await (
        await fetch("/api/push", { cache: "no-store" })
      ).json();
      if (!config.enabled) throw new Error("ارسال Push پیکربندی نشده است.");
      const raw = atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/"));
      const applicationServerKey = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }));
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          deviceName: String(form.get("deviceName") || ""),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "ثبت دستگاه انجام نشد.");
      setMessage(
        "دستگاه ثبت شد. دریافت Push به تنظیمات ترجیحی شما و دسترسی سرویس بستگی دارد.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "فعال‌سازی انجام نشد.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function unsubscribe() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("لغو ثبت انجام نشد.");
        await subscription.unsubscribe();
      }
      setMessage("اشتراک این مرورگر لغو شد.");
      router.refresh();
    } catch {
      setMessage("لغو اشتراک انجام نشد؛ از فهرست دستگاه‌ها لغو کنید.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-secondary">
        مجوز اعلان فقط با انتخاب شما درخواست می‌شود. متن اعلان روی دستگاه عمومی
        است؛ جزئیات خصوصی در سامانه باقی می‌ماند.
      </p>
      {!configured && (
        <p className="text-sm text-secondary">
          Push واقعی تا پیکربندی کلیدهای VAPID فعال نیست.
        </p>
      )}
      <form onSubmit={enable} className="grid gap-3">
        <label className="field">
          نام این دستگاه
          <Input
            name="deviceName"
            defaultValue="مرورگر من"
            minLength={2}
            maxLength={100}
            required
          />
        </label>
        <Button type="submit" disabled={busy || !configured}>
          {busy ? "در حال بررسی…" : "فعال‌سازی اعلان این دستگاه"}
        </Button>
      </form>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={unsubscribe}
      >
        لغو اشتراک این مرورگر
      </Button>
      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}
    </div>
  );
}
