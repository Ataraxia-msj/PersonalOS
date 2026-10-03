import { SpendingAnalysis } from "@/features/finance/components/spending-analysis";
import { getAnalysisPageData } from "@/lib/finance/service";

export default async function AnalysisPage({ searchParams }: { searchParams?: Promise<{ month?: string }> }) {
  const month = (await searchParams)?.month;
  const selectedMonth = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : undefined;
  return <SpendingAnalysis data={await getAnalysisPageData(selectedMonth)} />;
}
