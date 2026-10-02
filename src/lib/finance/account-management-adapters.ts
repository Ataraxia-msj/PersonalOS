import type { AccountBalanceView, AccountRow } from "./types";
import type { AccountEditData, AccountReferenceState, ManagedAccount } from "./account-management-types";

function adaptAccount(row: AccountRow, balance: AccountBalanceView | undefined): ManagedAccount {
  return {
    accountClass: row.account_class,
    accountType: row.account_type,
    balanceSource: balance?.balance_source ?? null,
    createdAt: row.created_at,
    currency: row.currency,
    estimatedBalance: balance?.estimated_balance ?? null,
    id: row.id,
    includeInNetWorth: row.include_in_net_worth,
    institution: row.institution,
    isActive: row.is_active,
    latestSnapshotAt: balance?.latest_snapshot_at ?? null,
    name: row.name,
    note: row.note,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

export function adaptManagedAccounts(rows: AccountRow[], balances: AccountBalanceView[]): ManagedAccount[] {
  const balancesById = new Map(balances.map((balance) => [balance.account_id, balance]));
  return rows.map((row) => adaptAccount(row, balancesById.get(row.id)));
}

export function adaptAccountEditData(
  row: AccountRow,
  balance: AccountBalanceView | undefined,
  referenceState: AccountReferenceState,
): AccountEditData {
  return {
    ...adaptAccount(row, balance),
    ...referenceState,
    structureLocked: referenceState.hasLines || referenceState.hasSnapshots,
  };
}
