import { notFound } from "next/navigation";
import { BudgetForm } from "@/features/finance/components/budget-form";
import { getBudgetFormData } from "@/lib/finance/service";
import { saveBudgetAction } from "../../actions";
export default async function EditBudgetPage({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(periodId)) notFound();
  const data = await getBudgetFormData(periodId);
  if (!data) notFound();
  return <BudgetForm data={data} action={saveBudgetAction} />;
}
