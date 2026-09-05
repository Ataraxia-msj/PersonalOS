import { ExpenseTransactionForm } from "@/features/finance/components/expense-transaction-form";
import { getExpenseTransactionFormData } from "@/lib/finance/service";

import { createExpenseTransactionAction } from "../actions";

function formatShanghaiDateTime(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).format(date).replace(" ", "T");
}

export default async function NewExpenseTransactionPage() {
  const data = await getExpenseTransactionFormData();

  return (
    <ExpenseTransactionForm
      action={createExpenseTransactionAction}
      data={data}
      defaultOccurredAt={formatShanghaiDateTime(new Date())}
    />
  );
}
