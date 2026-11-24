"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const dismissalKey = "delta-install-dismissed-at";
const sessionKey = "delta-install-suggested";
const week = 7 * 24 * 60 * 60 * 1000;

export function LoginInstall() {
  const dialog = useRef<HTMLDialogElement>(null);
  const deferred = useRef<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [manual, setManual] = useState(false);
  const [ios, setIos] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const display = matchMedia("(display-mode: standalone)");
    const isStandalone = () => display.matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const sync = () => {
      setInstalled(isStandalone());
      if (isStandalone()) dialog.current?.close();
    };
    const capture = (event: Event) => {
      event.preventDefault();
      deferred.current = event as InstallEvent;
      setNativeAvailable(true);
    };
    const didInstall = () => {
      deferred.current = null;
      setNativeAvailable(false);
      setInstalled(true);
      dialog.current?.close();
    };
    const timer = setTimeout(() => {
      sync();
      setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
      if (isStandalone()) return;
      let suppressed = false;
      try {
        const timestamp = Number(localStorage.getItem(dismissalKey));
        suppressed = (timestamp > 0 && Date.now() - timestamp < week) ||
          sessionStorage.getItem(sessionKey) === "true";
        sessionStorage.setItem(sessionKey, "true");
      } catch { /* Installation remains optional when storage is unavailable. */ }
      if (!suppressed) dialog.current?.showModal();
    }, 0);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", didInstall);
    display.addEventListener("change", sync);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", didInstall);
      display.removeEventListener("change", sync);
    };
  }, []);

  function dismiss() {
    try { localStorage.setItem(dismissalKey, String(Date.now())); } catch {}
    dialog.current?.close();
  }
  async function install() {
    const event = deferred.current;
    if (!event) { setManual(true); return; }
    deferred.current = null;
    setNativeAvailable(false);
    setBusy(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") dialog.current?.close();
      else dismiss();
    } catch { setManual(true); }
    finally { setBusy(false); }
  }
  return (
    <>
      {!installed && (
        <Button type="button" variant="outline" className="mb-5 w-full"
          onClick={() => dialog.current?.showModal()}>
          <Download size={18} aria-hidden="true" /> نصب اپلیکیشن
        </Button>
      )}
      <dialog ref={dialog} dir="rtl" aria-labelledby="install-title"
        aria-describedby="install-description"
        onCancel={(event) => { event.preventDefault(); dismiss(); }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-white p-6 text-foreground shadow-xl backdrop:bg-slate-900/40">
        <h2 id="install-title" className="text-xl font-bold">نصب اپلیکیشن ساختمان دلتا</h2>
        <p id="install-description" className="mt-3 text-sm leading-7 text-secondary">
          برای دسترسی سریع‌تر به خدمات ساختمان، اپلیکیشن دلتا را روی گوشی خود نصب کنید.
        </p>
        {(manual || ios) && (
          <div role="status" className="mt-4 rounded-xl bg-soft p-4 text-sm leading-7">
            {ios ? <p>در Safari دکمهٔ اشتراک‌گذاری را بزنید، سپس «افزودن به صفحهٔ اصلی» (Add to Home Screen) و «افزودن» را انتخاب کنید. اگر این گزینه در مرورگر فعلی نیست، همین نشانی را در Safari باز کنید.</p> :
              <p>در منوی Chrome یا Edge گزینهٔ «نصب برنامه» یا «افزودن به صفحهٔ اصلی» را انتخاب کنید. در رایانه، آیکون نصب کنار نوار نشانی را بررسی کنید. اگر گزینهٔ نصب نمایش داده نمی‌شود، می‌توانید فعلاً از همین وب‌سایت استفاده کنید.</p>}
          </div>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <Button type="button" disabled={busy} onClick={install}>
            {busy ? "در حال باز کردن نصب…" : nativeAvailable ? "نصب اپلیکیشن" : "راهنمای نصب اپلیکیشن"}
          </Button>
          <Button type="button" variant="ghost" onClick={dismiss}>فعلاً نصب نمی‌کنم</Button>
        </div>
      </dialog>
    </>
  );
}
