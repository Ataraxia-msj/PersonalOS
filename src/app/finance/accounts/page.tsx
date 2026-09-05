import { AccountList } from "@/features/finance/components/account-list";
import { getAccountsPageData } from "@/lib/finance/service";

export default async function AccountsPage() {
  return <AccountList accounts={await getAccountsPageData()} />;
}
