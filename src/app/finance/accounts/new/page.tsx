import { AccountManagementForm } from "@/features/finance/components/account-management-form";
import { shanghaiDateTime } from "@/lib/finance/reconciliation-validation";

import { createAccountAction } from "../actions";

export default function NewAccountPage() {
  return <AccountManagementForm action={createAccountAction} defaultBalanceAt={shanghaiDateTime(new Date())} mode="create" />;
}
