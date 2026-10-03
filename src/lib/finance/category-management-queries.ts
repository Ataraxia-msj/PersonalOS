import type { FinanceQueryClient } from "./queries";
import type { BudgetBucketRow, ExpenseCategoryRow } from "./types";

function readResult<T>(source: string, data: T, error: { message: string } | null): T {
  if (error) throw new Error(`${source}: ${error.message}`);
  return data;
}

async function readPages<T>(source: string, fetchPage: (start: number, end: number) => PromiseLike<{
  data: T[] | null; error: { message: string } | null;
}>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await fetchPage(start, start + 499);
    const page = readResult(source, data ?? [], error);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

export async function getManagedCategoryRows(client: FinanceQueryClient): Promise<ExpenseCategoryRow[]> {
  return readPages("categories", (start, end) => client.from("categories").select("*")
    .order("category_type", { ascending: true }).order("sort_order", { ascending: true })
    .order("name", { ascending: true }).order("id", { ascending: true }).range(start, end));
}

export async function getExpenseBudgetBuckets(client: FinanceQueryClient): Promise<BudgetBucketRow[]> {
  return readPages("budget_buckets", (start, end) => client.from("budget_buckets").select("*")
    .eq("bucket_kind", "expense")
    .order("sort_order", { ascending: true }).order("name", { ascending: true })
    .order("id", { ascending: true }).range(start, end));
}

export async function categoryHasJournalLines(client: FinanceQueryClient, categoryId: string): Promise<boolean> {
  const { count, error } = await client.from("journal_lines").select("id", { count: "exact", head: true })
    .eq("category_id", categoryId).limit(1);
  return readResult("journal_lines", (count ?? 0) > 0, error);
}
