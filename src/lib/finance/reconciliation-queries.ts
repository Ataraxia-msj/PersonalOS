import type { FinanceQueryClient } from "./queries";
import type { AccountBalanceView } from "./types";
import type { BalanceSnapshotRow, ReconciliationInput, ReconciliationPreviewRow, ReconciliationResult, ReconciliationSaveArgs } from "./reconciliation-types";

export class ReconciliationError extends Error {
  constructor(message: string, readonly code: string | null = null) { super(message); }
}
export async function getReconciliationAccount(client: FinanceQueryClient, id: string): Promise<AccountBalanceView | null> {
  const { data, error } = await client.from("vw_account_balances").select("*").eq("account_id", id).maybeSingle();
  if (error) throw new ReconciliationError(error.message, error.code);
  return data;
}
export async function getBalanceSnapshotHistory(client: FinanceQueryClient, id: string): Promise<BalanceSnapshotRow[]> {
  const rows: BalanceSnapshotRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("balance_snapshots")
      .select("id,account_id,snapshot_at,balance,source,note,created_at,updated_at")
      .eq("account_id", id).order("snapshot_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
    if (error) throw new ReconciliationError(error.message, error.code);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}
export async function previewBalanceReconciliation(client: FinanceQueryClient, input: ReconciliationInput): Promise<ReconciliationPreviewRow> {
  const { data, error } = await client.rpc("preview_balance_reconciliation", { p_account_id: input.accountId, p_snapshot_at: input.snapshotAt });
  if (error) throw new ReconciliationError(error.message, error.code);
  if (!data?.[0]) throw new ReconciliationError("校准预览未返回数据。");
  return data[0];
}
export async function reconcileAccountBalance(client: FinanceQueryClient, args: ReconciliationSaveArgs): Promise<ReconciliationResult> {
  const { data, error } = await client.rpc("reconcile_account_balance", args);
  if (error) throw new ReconciliationError(error.message, error.code);
  if (!data?.[0]) throw new ReconciliationError("校准保存结果未返回。");
  return data[0];
}
