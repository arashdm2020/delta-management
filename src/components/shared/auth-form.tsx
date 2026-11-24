"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const schema = z.object({
  phone: z.string().min(10, "شماره همراه را وارد کنید.").max(40),
});
export function AuthForm() {
  const router = useRouter();
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(
          sessionStorage.getItem("delta-otp-challenge") || "null",
        );
        if (
          saved &&
          typeof saved.id === "string" &&
          saved.expiresAt > Date.now()
        ) {
          setChallenge(saved.id);
          setUntil(saved.resendAt);
        } else sessionStorage.removeItem("delta-otp-challenge");
      } catch {
        /* Browser storage may be unavailable. */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { phone: "" } });
  async function request(data: { phone: string }) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setChallenge(result.challengeId);
      setUntil(Date.now() + 60000);
      try {
        sessionStorage.setItem(
          "delta-otp-challenge",
          JSON.stringify({
            id: result.challengeId,
            resendAt: Date.now() + 60000,
            expiresAt: Date.now() + 300000,
          }),
        );
      } catch {
        /* Verification remains available when browser storage is disabled. */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "ارتباط برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const normalized = code.replace(/[۰-۹]/g, (c) =>
        String(c.charCodeAt(0) - 1776),
      );
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge, code: normalized }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      sessionStorage.removeItem("delta-otp-challenge");
      router.replace(result.next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ارتباط برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {challenge ? (
        <form key="verify-otp" onSubmit={verify} className="grid gap-5">
          <label htmlFor="otp" className="text-sm font-medium">
            کد یک‌بارمصرف پیامک‌شده
          </label>
          <Input
            id="otp"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            minLength={4}
            required
            dir="ltr"
            autoFocus
            className="text-center text-2xl tracking-[0.5em]"
          />
          <p className="text-xs leading-6 text-secondary">
            کد تا ۵ دقیقه معتبر است. درخواست دوباره پس از یک دقیقه امکان‌پذیر
            است.
          </p>
          <Button
            type="submit"
            disabled={busy || ![4, 6].includes(code.length)}
          >
            {busy ? "در حال بررسی…" : "تأیید و ورود"}
          </Button>
          <Button
            variant="ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              if (Date.now() < until) {
                setError("برای ارسال دوباره یک دقیقه صبر کنید.");
                return;
              }
              sessionStorage.removeItem("delta-otp-challenge");
              setChallenge("");
              setCode("");
            }}
          >
            تغییر شماره / درخواست کد جدید
          </Button>
        </form>
      ) : (
        <form
          key="request-otp"
          onSubmit={(event) => {
            void handleSubmit(request)(event);
          }}
          className="grid gap-5"
        >
          <label htmlFor="phone" className="text-sm font-medium">
            شماره تلفن همراه
          </label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="شماره همراه شما"
            dir="ltr"
            {...register("phone")}
          />
          {errors.phone && (
            <p role="alert" className="text-sm text-red-700">
              {errors.phone.message}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "در حال ارسال…" : "دریافت کد ورود"}
          </Button>
        </form>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
    </div>
  );
}
