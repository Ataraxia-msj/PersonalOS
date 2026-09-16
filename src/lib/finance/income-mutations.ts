import type { SupabaseClient } from "@supabase/supabase-js";

import type { CreateIncomeTransactionArgs, Database } from "./types";

export type IncomeMutationClient = SupabaseClient<Database>;

export interface CreateIncomeTransactionInput {
  requestId: string;
  occurredAt: string;
  description: string;
  accountId: string;
  amount: number;
  categoryId: string;
  rawText: string | null;
  memo: string | null;
}

export interface CreateIncomeTransactionResult {
  entryId: string;
  lineId: string;
  replayed: boolean;
}

export class IncomeMutationError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
    this.name = "IncomeMutationError";
  }
}

export async function createIncomeTransaction(
  client: IncomeMutationClient,
  input: CreateIncomeTransactionInput,
): Promise<CreateIncomeTransactionResult> {
  const args: CreateIncomeTransactionArgs = {
    p_account_id: input.accountId,
    p_amount: input.amount,
    p_category_id: input.categoryId,
    p_description: input.description,
    p_memo: input.memo,
    p_occurred_at: input.occurredAt,
    p_raw_text: input.rawText,
    p_request_id: input.requestId,
  };
  const { data, error } = await client.rpc("create_income_transaction", args);

  if (error) {
    throw new IncomeMutationError(error.message, error.code ?? null);
  }

  const row = data?.[0];
  if (!row) {
    throw new IncomeMutationError("create_income_transaction returned no result");
  }

  return {
    entryId: row.entry_id,
    lineId: row.line_id,
    replayed: row.replayed,
  };
}
