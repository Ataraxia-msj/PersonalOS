import { createClient } from "@/lib/supabase/server";

import { adaptAccountEditData, adaptManagedAccounts } from "./account-management-adapters";
import {
  getAccountReferenceState,
  getAllAccountBalances,
  getManagedAccountRows,
} from "./account-management-queries";
import type { AccountEditData, ManagedAccount } from "./account-management-types";

export async function getAccountManagementPageData(): Promise<ManagedAccount[]> {
  const client = await createClient();
  const [rows, balances] = await Promise.all([
    getManagedAccountRows(client),
    getAllAccountBalances(client),
  ]);
  return adaptManagedAccounts(rows, balances);
}

export async function getAccountEditData(accountId: string): Promise<AccountEditData | null> {
  const client = await createClient();
  const [rows, balances] = await Promise.all([
    getManagedAccountRows(client),
    getAllAccountBalances(client),
  ]);
  const row = rows.find((candidate) => candidate.id === accountId);
  if (!row) return null;
  const referenceState = await getAccountReferenceState(client, accountId);
  return adaptAccountEditData(
    row,
    balances.find((balance) => balance.account_id === accountId),
    referenceState,
  );
}
