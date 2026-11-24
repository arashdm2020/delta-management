import { requireManager } from "@/modules/auth/session";
import { ManagementDashboard } from "@/modules/dashboards/management";
export const dynamic = "force-dynamic";
export default async function Management() {
  return <ManagementDashboard actor={await requireManager()} />;
}
