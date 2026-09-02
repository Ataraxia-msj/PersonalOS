import { TransactionList } from "@/features/finance/components/transaction-list";
import { financeDataset } from "@/features/finance/data";

export default function TransactionsPage() {
  return (
    <TransactionList
      accounts={financeDataset.accounts}
      transactions={financeDataset.transactions}
    />
  );
}
