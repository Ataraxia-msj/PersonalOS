import { AccountList } from "@/features/finance/components/account-list";
import { financeDataset } from "@/features/finance/data";

export default function AccountsPage() {
  return <AccountList accounts={financeDataset.accounts} />;
}
