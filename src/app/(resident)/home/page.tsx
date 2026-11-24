import { requireApproved } from "@/modules/auth/session";
import { canManage } from "@/lib/security/core";
import { ManagementDashboard } from "@/modules/dashboards/management";
import { ResidentDashboard } from "@/modules/dashboards/resident";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  const actor = await requireApproved();
  if (canManage(actor)) return <ManagementDashboard actor={actor} />;
  const { unit } = await searchParams;
  return <ResidentDashboard actor={actor} unitId={unit} />;
}
