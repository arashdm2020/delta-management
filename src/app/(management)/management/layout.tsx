import { requireManager } from "@/modules/auth/session";
import { Shell } from "@/components/layout/shell";
import { Navigation } from "@/components/navigation/nav";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireManager();
  return (
    <Shell user={user}>
      <div className="mb-6">
        <h1 className="page-heading">مدیریت ساختمان</h1>
        <p className="page-description mb-5">
          اطلاعات واقعی، تصمیم‌های قابل پیگیری
        </p>
        <Navigation mode="management" />
      </div>
      {children}
    </Shell>
  );
}
