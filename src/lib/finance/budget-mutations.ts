import type { FinanceMutationClient } from "./mutations";
import { FinanceMutationError } from "./mutations";
import type { SaveMonthlyBudgetArgs, SaveMonthlyBudgetRow } from "./types";

export async function saveMonthlyBudget(client: FinanceMutationClient, args: SaveMonthlyBudgetArgs): Promise<SaveMonthlyBudgetRow> {
  const { data, error } = await client.rpc("save_monthly_budget", args);
  if (error) throw new FinanceMutationError(error.message, error.code ?? null);
  const row = data?.[0];
  if (!row) throw new FinanceMutationError("save_monthly_budget returned no result");
  return row;
}
