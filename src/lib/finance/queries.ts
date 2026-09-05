import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AccountBalanceView,
  BudgetExecutionView,
  BudgetImpactRow,
  Database,
  ExpenseCategoryRow,
  MonthlyFinancialSummaryView,
  NetWorthView,
  TransactionDetailView,
} from "./types";

export type FinanceQueryClient = SupabaseClient<Database>;

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

export async function getActiveBudgetExecution(
  client: FinanceQueryClient,
): Promise<BudgetExecutionView[]> {
  const { data, error } = await client
    .from("vw_budget_execution")
    .select("*")
    .eq("period_status", "active")
    .order("sort_order", { ascending: true });
  return readResult("vw_budget_execution", data ?? [], error);
}

export async function getBudgetExecutionHistory(
  client: FinanceQueryClient,
): Promise<BudgetExecutionView[]> {
  const { data, error } = await client
    .from("vw_budget_execution")
    .select("*")
    .order("start_date", { ascending: false })
    .order("sort_order", { ascending: true });
  return readResult("vw_budget_execution", data ?? [], error);
}

export async function getActiveMonthlySummary(
  client: FinanceQueryClient,
): Promise<MonthlyFinancialSummaryView | null> {
  const { data, error } = await client
    .from("vw_monthly_financial_summary")
    .select("*")
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return readResult("vw_monthly_financial_summary", data, error);
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
  const { data, error } = await client
    .from("vw_transaction_details")
    .select("*")
    .eq("status", "confirmed")
    .order("occurred_at", { ascending: false })
    .order("line_sort_order", { ascending: true });
  return readResult("vw_transaction_details", data ?? [], error);
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
