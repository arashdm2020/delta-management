import { requireApproved } from "@/modules/auth/session";
import { Shell } from "@/components/layout/shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireApproved();
  return <Shell user={user}>{children}</Shell>;
}
