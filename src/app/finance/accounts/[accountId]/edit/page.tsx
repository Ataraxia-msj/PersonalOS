import { notFound } from "next/navigation";

import { AccountManagementForm } from "@/features/finance/components/account-management-form";
import { getAccountEditData } from "@/lib/finance/account-management-service";

import { setAccountActiveAction, updateAccountAction } from "../../actions";

export default async function EditAccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const data = await getAccountEditData(accountId);
  if (!data) notFound();
  return <AccountManagementForm action={updateAccountAction} activationAction={setAccountActiveAction}
    initialValues={data} key={`${data.id}:${data.updatedAt}`} mode="edit" />;
}
