import { SpendingAnalysis } from "@/features/finance/components/spending-analysis";
import { getAnalysisPageData } from "@/lib/finance/service";

export default async function AnalysisPage() {
  return <SpendingAnalysis spending={await getAnalysisPageData()} />;
}
