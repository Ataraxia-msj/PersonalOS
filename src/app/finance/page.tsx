import { FinanceOverview } from "@/features/finance/components/finance-overview";
import { getFinanceOverviewData } from "@/lib/finance/service";

export default async function FinancePage() {
  return <FinanceOverview data={await getFinanceOverviewData()} />;
}
