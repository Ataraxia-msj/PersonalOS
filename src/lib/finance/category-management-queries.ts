import type { FinanceQueryClient } from "./queries";
import type { BudgetBucketRow, ExpenseCategoryRow } from "./types";

function readResult<T>(source: string, data: T, error: { message: string } | null): T {
  if (error) throw new Error(`${source}: ${error.message}`);
  return data;
}

export async function getManagedCategoryRows(client: FinanceQueryClient): Promise<ExpenseCategoryRow[]> {
  const { data, error } = await client.from("categories").select("*")
    .order("category_type", { ascending: true }).order("sort_order", { ascending: true })
    .order("name", { ascending: true }).order("id", { ascending: true });
  return readResult("categories", data ?? [], error);
}

export async function getExpenseBudgetBuckets(client: FinanceQueryClient): Promise<BudgetBucketRow[]> {
  const { data, error } = await client.from("budget_buckets").select("*")
    .eq("bucket_kind", "expense")
    .order("sort_order", { ascending: true }).order("name", { ascending: true });
  return readResult("budget_buckets", data ?? [], error);
}

export async function categoryHasJournalLines(client: FinanceQueryClient, categoryId: string): Promise<boolean> {
  const { count, error } = await client.from("journal_lines").select("id", { count: "exact", head: true })
    .eq("category_id", categoryId).limit(1);
  return readResult("journal_lines", (count ?? 0) > 0, error);
}
