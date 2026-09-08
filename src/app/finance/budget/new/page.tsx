import { BudgetForm } from "@/features/finance/components/budget-form";
import { getBudgetFormData } from "@/lib/finance/service";
import { saveBudgetAction } from "../actions";
export default async function NewBudgetPage() {
  const data = await getBudgetFormData();
  if (!data) throw new Error("无法读取预算配置");
  return <BudgetForm data={data} action={saveBudgetAction} />;
}
