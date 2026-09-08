import { BudgetList } from "@/features/finance/components/budget-list";
import { getBudgetPageData } from "@/lib/finance/service";

export default async function BudgetPage({ searchParams }: { searchParams?: Promise<{ period?: string }> }) {
  const [months, params] = await Promise.all([getBudgetPageData(), searchParams]);
  return <BudgetList key={params?.period} months={months} selectedPeriod={params?.period} />;
}
