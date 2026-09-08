import { ExpenseTransactionForm } from "@/features/finance/components/expense-transaction-form";
import { getExpenseTransactionFormData } from "@/lib/finance/service";
import Link from "next/link";
import { TransferTransactionForm } from "@/features/finance/components/transfer-transaction-form";
import { getTransferFormData } from "@/lib/finance/transfer-service";
import { shanghaiDateTime } from "@/lib/finance/reconciliation-validation";
import { createTransferAction } from "../transfer-actions";
import styles from "@/features/finance/components/transfer.module.css";

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

export default async function NewExpenseTransactionPage({ searchParams }: {
  searchParams: Promise<{ type?: string }>;
}) {
  const transfer = (await searchParams).type === "transfer";
  const form = transfer ? <TransferTransactionForm action={createTransferAction}
    data={await getTransferFormData()} defaultOccurredAt={shanghaiDateTime(new Date())} /> : (
    <ExpenseTransactionForm
      action={createExpenseTransactionAction}
      data={await getExpenseTransactionFormData()}
      defaultOccurredAt={formatShanghaiDateTime(new Date())}
    />
  );
  return <>
    <nav aria-label="新增交易类型" className={styles.navigation}>
      <Link href="/finance/transactions/new" aria-current={!transfer ? "page" : undefined}>支出</Link>
      <Link href="/finance/transactions/new?type=transfer" aria-current={transfer ? "page" : undefined}>转账</Link>
    </nav>
    {form}
  </>;
}
