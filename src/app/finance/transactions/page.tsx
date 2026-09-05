import { TransactionList } from "@/features/finance/components/transaction-list";
import { getTransactionsPageData } from "@/lib/finance/service";

export default async function TransactionsPage() {
  const data = await getTransactionsPageData();
  return (
    <TransactionList
      transactions={data.transactions}
    />
  );
}
