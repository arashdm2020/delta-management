"use client";
import { useEffect, useState } from "react";
export function Pwa() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {});
    }
  }, []);
  return null;
}
export function InstallGuide() {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const query = matchMedia("(display-mode: standalone)");
    const update = () => setStandalone(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return (
    <div className="space-y-4 text-sm leading-8">
      <p className="font-semibold">
        {standalone
          ? "برنامه در حالت نصب‌شده اجرا می‌شود."
          : "ساختمان دلتا، همیشه در دسترس شما"}
      </p>
      <p>
        اندروید: در منوی Chrome گزینهٔ «نصب برنامه» یا «افزودن به صفحه اصلی» را
        انتخاب کنید.
      </p>
      <p>
        آیفون: در Safari دکمهٔ اشتراک‌گذاری و سپس Add to Home Screen را بزنید.
      </p>
      <p>رایانه: در Chrome یا Edge آیکون نصب کنار نوار نشانی را انتخاب کنید.</p>
      <p className="text-secondary">
        نصب با HTTPS یا localhost امکان‌پذیر است. اطلاعات خصوصی و مالی آفلاین
        ذخیره نمی‌شوند.
      </p>
    </div>
  );
}
