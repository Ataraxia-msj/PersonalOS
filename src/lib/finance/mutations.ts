import type { SupabaseClient } from "@supabase/supabase-js";
import { assertBudgetAttributionSchema } from "./queries";

import type {
  CreateExpenseTransactionArgs,
  Database,
  ExpenseBudgetWarningCode,
  UpdateExpenseTransactionArgs,
} from "./types";

export type FinanceMutationClient = SupabaseClient<Database>;

export interface CreateExpenseTransactionInput {
  occurredAt: string;
  description: string;
  accountId: string;
  amount: number;
  categoryId: string;
  budgetBucketId: string | null;
  rawText: string | null;
  memo: string | null;
  excludeFromBudget: boolean;
}

export interface UpdateExpenseTransactionInput extends CreateExpenseTransactionInput {
  entryId: string;
}

export interface CreateExpenseTransactionResult {
  entryId: string;
  lineId: string;
  budgetImpactCreated: boolean;
  budgetPeriodId: string | null;
  budgetBucketId: string | null;
  budgetExcluded: boolean;
  warningCode: ExpenseBudgetWarningCode | null;
}

export class FinanceMutationError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
    this.name = "FinanceMutationError";
  }
}

export async function createExpenseTransaction(
  client: FinanceMutationClient,
  input: CreateExpenseTransactionInput,
): Promise<CreateExpenseTransactionResult> {
  await assertBudgetAttributionSchema(client);
  const args: CreateExpenseTransactionArgs = {
    p_account_id: input.accountId,
    p_amount: input.amount,
    p_budget_bucket_id: input.budgetBucketId,
    p_category_id: input.categoryId,
    p_description: input.description,
    p_exclude_from_budget: input.excludeFromBudget,
    p_memo: input.memo,
    p_occurred_at: input.occurredAt,
    p_raw_text: input.rawText,
  };
  const { data, error } = await client.rpc("create_expense_transaction", args);

  if (error) {
    throw new FinanceMutationError(error.message, error.code ?? null);
  }

  const row = data?.[0];
  if (!row) {
    throw new FinanceMutationError("create_expense_transaction returned no result");
  }

  return {
    budgetBucketId: row.budget_bucket_id,
    budgetExcluded: row.budget_excluded,
    budgetImpactCreated: row.budget_impact_created,
    budgetPeriodId: row.budget_period_id,
    entryId: row.entry_id,
    lineId: row.line_id,
    warningCode: row.warning_code,
  };
}

export async function updateExpenseTransaction(
  client: FinanceMutationClient,
  input: UpdateExpenseTransactionInput,
): Promise<CreateExpenseTransactionResult> {
  await assertBudgetAttributionSchema(client);
  const args: UpdateExpenseTransactionArgs = {
    p_account_id: input.accountId,
    p_amount: input.amount,
    p_budget_bucket_id: input.budgetBucketId,
    p_category_id: input.categoryId,
    p_description: input.description,
    p_entry_id: input.entryId,
    p_exclude_from_budget: input.excludeFromBudget,
    p_memo: input.memo,
    p_occurred_at: input.occurredAt,
    p_raw_text: input.rawText,
  };
  const { data, error } = await client.rpc("update_expense_transaction", args);

  if (error) {
    throw new FinanceMutationError(error.message, error.code ?? null);
  }

  const row = data?.[0];
  if (!row) {
    throw new FinanceMutationError("update_expense_transaction returned no result");
  }

  return {
    budgetBucketId: row.budget_bucket_id,
    budgetExcluded: row.budget_excluded,
    budgetImpactCreated: row.budget_impact_created,
    budgetPeriodId: row.budget_period_id,
    entryId: row.entry_id,
    lineId: row.line_id,
    warningCode: row.warning_code,
  };
}
