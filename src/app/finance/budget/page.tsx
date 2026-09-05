import { BudgetList } from "@/features/finance/components/budget-list";
import { getBudgetPageData } from "@/lib/finance/service";

export default async function BudgetPage() {
  return <BudgetList months={await getBudgetPageData()} />;
}
