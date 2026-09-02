import { FinanceOverview } from "@/features/finance/components/finance-overview";
import { financeDataset } from "@/features/finance/data";

export default function FinancePage() {
  return <FinanceOverview data={financeDataset} />;
}
