import { createClient } from "@/lib/supabase/server";
import { getAccountBalances, getBudgetBuckets } from "./queries";
import type { TransferFormData } from "./transfer-types";

export async function getTransferFormData(): Promise<TransferFormData> {
  const client = await createClient();
  const [accounts, buckets] = await Promise.all([
    getAccountBalances(client), getBudgetBuckets(client),
  ]);
  return {
    accounts: accounts.filter((row) => row.is_active).map((row) => ({
      id: row.account_id, name: row.account_name, institution: row.institution,
      accountClass: row.account_class, currency: row.currency, balance: row.estimated_balance,
    })),
    budgetBuckets: buckets.filter((row) => row.is_active && ["saving", "investment", "debt"].includes(row.bucket_kind))
      .map((row) => ({ id: row.id, name: row.name, kind: row.bucket_kind })),
  };
}
