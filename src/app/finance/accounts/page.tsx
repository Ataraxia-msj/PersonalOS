import { AccountList } from "@/features/finance/components/account-list";
import { getAccountManagementPageData } from "@/lib/finance/account-management-service";

export default async function AccountsPage() {
  return <AccountList accounts={await getAccountManagementPageData()} />;
}
