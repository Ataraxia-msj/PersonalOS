import { SpendingAnalysis } from "@/features/finance/components/spending-analysis";
import { financeDataset } from "@/features/finance/data";
import { getSpendingByCategory } from "@/features/finance/selectors";

export default function AnalysisPage() {
  return <SpendingAnalysis spending={getSpendingByCategory(financeDataset)} />;
}
