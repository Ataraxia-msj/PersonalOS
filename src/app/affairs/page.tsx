import { getAffairsDashboardData } from "@/lib/affairs/service";
import { ProgressDashboard } from "@/features/affairs/components/progress-dashboard";
import { submitAffairsAction } from "./actions";
export default async function Page() {
  return (
    <ProgressDashboard
      data={await getAffairsDashboardData()}
      action={submitAffairsAction}
    />
  );
}
