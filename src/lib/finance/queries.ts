import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AccountBalanceView,
  BudgetBucketRow,
  BudgetPeriodRow,
  BudgetAllocationRow,
  BudgetExecutionView,
  BudgetImpactRow,
  Database,
  ExpenseCategoryRow,
  MonthlyFinancialSummaryView,
  NetWorthView,
  TransactionDetailView,
} from "./types";
import { shanghaiDate } from "./budget-validation";

export type FinanceQueryClient = SupabaseClient<Database>;
export type TransactionAccountCurrency = Pick<AccountBalanceView, "account_id" | "currency">;

export async function getTransactionAccountCurrencies(client: FinanceQueryClient): Promise<TransactionAccountCurrency[]> {
  // Include inactive accounts: their historical transactions still need truthful currency labels.
  return readPages("vw_account_balances", (start, end) => client.from("vw_account_balances")
    .select("account_id,currency").order("account_id").range(start, end));
}

function readResult<T>(view: string, data: T, error: { message: string } | null): T {
  if (error) {
    throw new Error(`${view}: ${error.message}`);
  }
  return data;
}

export async function getNetWorth(client: FinanceQueryClient): Promise<NetWorthView | null> {
  const { data, error } = await client.from("vw_net_worth").select("*").maybeSingle();
  return readResult("vw_net_worth", data, error);
}

export async function getAccountBalances(
  client: FinanceQueryClient,
): Promise<AccountBalanceView[]> {
  const { data, error } = await client
    .from("vw_account_balances")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return readResult("vw_account_balances", data ?? [], error);
}

export async function getExpenseCategories(
  client: FinanceQueryClient,
): Promise<ExpenseCategoryRow[]> {
  const { data, error } = await client
    .from("categories")
    .select("*")
    .eq("category_type", "expense")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return readResult("categories", data ?? [], error);
}

export async function getIncomeCategories(
  client: FinanceQueryClient,
): Promise<ExpenseCategoryRow[]> {
  const { data, error } = await client
    .from("categories")
    .select("*")
    .eq("category_type", "income")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return readResult("categories", data ?? [], error);
}

export async function getActiveBudgetExecution(
  client: FinanceQueryClient,
  date = shanghaiDate(),
): Promise<BudgetExecutionView[]> {
  const { data, error } = await client
    .from("vw_budget_execution")
    .select("*")
    .eq("period_status", "active")
    .lte("start_date", date)
    .gte("end_date", date)
    .order("sort_order", { ascending: true });
  return readResult("vw_budget_execution", data ?? [], error);
}

export async function getBudgetExecutionHistory(
  client: FinanceQueryClient,
): Promise<BudgetExecutionView[]> {
  return readPages<BudgetExecutionView>("vw_budget_execution", (start, end) => client
    .from("vw_budget_execution")
    .select("*")
    .order("start_date", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("budget_bucket_id", { ascending: true }).range(start, end));
}

export async function getActiveMonthlySummary(
  client: FinanceQueryClient,
  date = shanghaiDate(),
): Promise<MonthlyFinancialSummaryView | null> {
  const { data, error } = await client
    .from("vw_monthly_financial_summary")
    .select("*")
    .eq("status", "active")
    .lte("start_date", date)
    .gte("end_date", date)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return readResult("vw_monthly_financial_summary", data, error);
}

async function readPages<T>(table: string, fetchPage: (start: number, end: number) => PromiseLike<{
  data: T[] | null; error: { message: string } | null;
}>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await fetchPage(start, start + 499);
    const page = readResult(table, data ?? [], error);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

export async function getBudgetBuckets(client: FinanceQueryClient): Promise<BudgetBucketRow[]> {
  await assertBudgetAttributionSchema(client);
  return readPages("budget_buckets", (start, end) => client.from("budget_buckets")
    .select("*").order("sort_order").order("id").range(start, end));
}

export async function assertBudgetAttributionSchema(client: FinanceQueryClient): Promise<void> {
  const { error } = await client.from("vw_transaction_details").select("saved_budget_bucket_id").limit(0);
  if (error) throw new Error("预算归属读取不可用，请确认数据库迁移已部署且当前用户有读取权限。", { cause: new Error(error.message) });
}
export async function getBudgetPeriods(client: FinanceQueryClient): Promise<BudgetPeriodRow[]> {
  return readPages("budget_periods", (start, end) => client.from("budget_periods")
    .select("*").order("start_date", { ascending: false }).order("id").range(start, end));
}
export async function getBudgetAllocations(client: FinanceQueryClient, periodId: string): Promise<BudgetAllocationRow[]> {
  return readPages("budget_allocations", (start, end) => client.from("budget_allocations")
    .select("*").eq("budget_period_id", periodId).order("id").range(start, end));
}
export async function getBudgetSummaries(client: FinanceQueryClient): Promise<MonthlyFinancialSummaryView[]> {
  return readPages("vw_monthly_financial_summary", (start, end) => client.from("vw_monthly_financial_summary")
    .select("*").order("start_date", { ascending: false }).order("budget_period_id").range(start, end));
}

export async function getMonthlyFinancialSummaries(
  client: FinanceQueryClient,
): Promise<MonthlyFinancialSummaryView[]> {
  const { data, error } = await client
    .from("vw_monthly_financial_summary")
    .select("*")
    .order("start_date", { ascending: false })
    .limit(7);
  return readResult("vw_monthly_financial_summary", data ?? [], error);
}

async function getConfirmedTransactionLines(
  client: FinanceQueryClient,
): Promise<TransactionDetailView[]> {
  return readPages<TransactionDetailView>("vw_transaction_details", (start, end) => client
    .from("vw_transaction_details")
    .select("*")
    .eq("status", "confirmed")
    .order("occurred_at", { ascending: false })
    .order("line_sort_order", { ascending: true })
    .order("entry_id", { ascending: true })
    .order("line_id", { ascending: true }).range(start, end));
}

export async function getRecentTransactions(
  client: FinanceQueryClient,
): Promise<TransactionDetailView[]> {
  return getConfirmedTransactionLines(client);
}

export async function getTransactions(
  client: FinanceQueryClient,
): Promise<TransactionDetailView[]> {
  return getConfirmedTransactionLines(client);
}

export interface ExpenseTransactionEditRows {
  transactionLines: TransactionDetailView[];
  budgetImpacts: BudgetImpactRow[];
}

export async function getExpenseTransactionForEdit(
  client: FinanceQueryClient,
  entryId: string,
): Promise<ExpenseTransactionEditRows> {
  const [transactionResult, impactResult] = await Promise.all([
    client
      .from("vw_transaction_details")
      .select("*")
      .eq("entry_id", entryId)
      .eq("status", "confirmed")
      .order("line_sort_order", { ascending: true }),
    client
      .from("budget_impacts")
      .select("*")
      .eq("entry_id", entryId)
      .limit(2),
  ]);

  return {
    budgetImpacts: readResult("budget_impacts", impactResult.data ?? [], impactResult.error),
    transactionLines: readResult(
      "vw_transaction_details",
      transactionResult.data ?? [],
      transactionResult.error,
    ),
  };
}
