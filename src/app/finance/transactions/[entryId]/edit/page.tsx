import { notFound } from "next/navigation";

import { ExpenseTransactionForm } from "@/features/finance/components/expense-transaction-form";
import { getExpenseTransactionEditData } from "@/lib/finance/service";

import { updateExpenseTransactionAction } from "./actions";

interface EditExpenseTransactionPageProps {
  params: Promise<{ entryId: string }>;
}

export default async function EditExpenseTransactionPage({
  params,
}: EditExpenseTransactionPageProps) {
  const { entryId } = await params;
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
