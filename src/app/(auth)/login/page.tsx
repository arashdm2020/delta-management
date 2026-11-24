import { Building2, ShieldCheck } from "lucide-react";
import { AuthForm } from "@/components/shared/auth-form";
import { Card } from "@/components/ui/card";
export default function Login() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-white text-primary shadow-sm">
            <Building2 size={32} />
          </span>
          <h1 className="page-heading">به ساختمان دلتا خوش آمدید</h1>
          <p className="page-description">یک خانه، یک همراه برای مدیریت بهتر</p>
        </div>
        <Card>
          <h2 className="mb-2 text-lg font-bold">ورود به حساب کاربری</h2>
          <p className="mb-7 text-sm leading-7 text-secondary">
            {process.env.MEMBERS_ONLY_LOGIN === "true"
              ? "ورود ویژهٔ اعضای ساختمان است. از شماره‌ای استفاده کنید که مدیریت برای شما ثبت کرده است؛ ثبت‌نام عمومی وجود ندارد."
              : "با شمارهٔ همراه خود وارد شوید. دسترسی به ساختمان پس از تأیید مدیریت فعال می‌شود."}
          </p>
          <AuthForm />
        </Card>
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-secondary">
          <ShieldCheck size={16} />
          ورود امن با کد یک‌بارمصرف
        </p>
      </div>
    </main>
  );
}
