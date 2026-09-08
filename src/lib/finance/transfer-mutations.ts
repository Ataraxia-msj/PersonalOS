import type { FinanceMutationClient } from "./mutations";
import { FinanceMutationError } from "./mutations";
import { reconciliationUuid } from "./reconciliation-validation";
import type { TransferArgs, TransferResult } from "./transfer-types";

export async function createTransferTransaction(client: FinanceMutationClient, args: TransferArgs): Promise<TransferResult> {
  const { data, error } = await client.rpc("create_transfer_transaction", args);
  if (error) throw new FinanceMutationError(error.message, error.code ?? null);
  const row = data?.[0];
  // A missing/malformed response cannot establish that a write did not commit.
  if (data?.length !== 1 || !row || row.entry_id !== args.p_request_id
    || !reconciliationUuid.test(row.from_line_id) || !reconciliationUuid.test(row.to_line_id)
    || row.from_line_id === row.to_line_id || typeof row.replayed !== "boolean"
    || typeof row.budget_impact_created !== "boolean"
    || !(row.budget_period_id === null || reconciliationUuid.test(row.budget_period_id))
    || !(row.budget_bucket_id === null || reconciliationUuid.test(row.budget_bucket_id))
    || !(row.warning_code === null || typeof row.warning_code === "string")) {
    throw new Error("Unconfirmed transfer response");
  }
  return row;
}
