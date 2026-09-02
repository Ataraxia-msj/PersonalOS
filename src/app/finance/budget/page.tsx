import { BudgetList } from "@/features/finance/components/budget-list";
import { financeDataset } from "@/features/finance/data";

export default function BudgetPage() {
  return <BudgetList budgets={financeDataset.budgets} />;
}
