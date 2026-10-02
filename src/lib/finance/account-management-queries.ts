import type { AccountBalanceView, AccountRow } from "./types";
import type { FinanceQueryClient } from "./queries";
import type { AccountReferenceState } from "./account-management-types";

function readResult<T>(source: string, data: T, error: { message: string } | null): T {
  if (error) throw new Error(`${source}: ${error.message}`);
  return data;
}

export async function getManagedAccountRows(client: FinanceQueryClient): Promise<AccountRow[]> {
  const { data, error } = await client.from("accounts").select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .order("id", { ascending: true });
  return readResult("accounts", data ?? [], error);
}

export async function getAllAccountBalances(client: FinanceQueryClient): Promise<AccountBalanceView[]> {
  const { data, error } = await client.from("vw_account_balances").select("*")
    .order("sort_order", { ascending: true })
    .order("account_name", { ascending: true })
    .order("account_id", { ascending: true });
  return readResult("vw_account_balances", data ?? [], error);
}

export async function getAccountReferenceState(
  client: FinanceQueryClient,
  accountId: string,
): Promise<AccountReferenceState> {
  const [snapshotResult, lineResult] = await Promise.all([
    client.from("balance_snapshots").select("id", { count: "exact", head: true })
      .eq("account_id", accountId).limit(1),
    client.from("journal_lines").select("id", { count: "exact", head: true })
      .eq("account_id", accountId).limit(1),
  ]);
  const snapshots = readResult("balance_snapshots", snapshotResult.count ?? 0, snapshotResult.error);
  const lines = readResult("journal_lines", lineResult.count ?? 0, lineResult.error);
  return { hasLines: lines > 0, hasSnapshots: snapshots > 0 };
}
