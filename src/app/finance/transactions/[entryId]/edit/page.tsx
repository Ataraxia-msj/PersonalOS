import { notFound } from "next/navigation";

import { ExpenseTransactionForm } from "@/features/finance/components/expense-transaction-form";
import { IncomeTransactionForm } from "@/features/finance/components/income-transaction-form";
import { getExpenseTransactionEditData, getIncomeTransactionEditData } from "@/lib/finance/service";

import { updateExpenseTransactionAction } from "./actions";
import { updateIncomeTransactionAction } from "./income-actions";

interface EditExpenseTransactionPageProps {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ type?: string }>;
}

export default async function EditExpenseTransactionPage({
  params,
  searchParams,
}: EditExpenseTransactionPageProps) {
  const { entryId } = await params;
  const type = (await searchParams).type;
  if (type === "income") {
    const income = await getIncomeTransactionEditData(entryId);
    if (!income) notFound();
    return <IncomeTransactionForm action={updateIncomeTransactionAction}
      data={income.formData} initialValues={income.initialValues} mode="edit" />;
  }
  const data = await getExpenseTransactionEditData(entryId);

  if (!data) {
    notFound();
  }

  return (
    <ExpenseTransactionForm
      action={updateExpenseTransactionAction}
      data={data.formData}
      initialValues={data.initialValues}
      mode="edit"
    />
  );
}
