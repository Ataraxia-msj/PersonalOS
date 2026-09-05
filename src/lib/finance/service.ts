import type {
  Account,
  BudgetMonth,
  CategorySpending,
  ExpenseTransactionFormData,
  ExpenseTransactionEditData,
  FinanceOverviewData,
  Transaction,
} from "@/features/finance/types";
import { createClient } from "@/lib/supabase/server";

import {
  adaptAccountBalances,
  adaptBudgetMonths,
  adaptExpenseTransactionFormData,
  adaptMonthlyAnalysis,
  adaptMonthlyCashflow,
  adaptNetWorth,
  adaptTransactions,
} from "./adapters";
import {
  getAccountBalances,
  getActiveMonthlySummary,
  getBudgetExecutionHistory,
  getExpenseCategories,
  getExpenseTransactionForEdit,
  getMonthlyFinancialSummaries,
  getNetWorth,
  getRecentTransactions,
  getTransactions,
} from "./queries";

export async function getFinanceOverviewData(): Promise<FinanceOverviewData> {
  const client = await createClient();
  const [netWorthRow, activeSummary, monthlySummaries, transactionLines] = await Promise.all([
    getNetWorth(client),
    getActiveMonthlySummary(client),
    getMonthlyFinancialSummaries(client),
    getRecentTransactions(client),
  ]);
  const netWorth = adaptNetWorth(netWorthRow);

  return {
    cashflow: adaptMonthlyCashflow(monthlySummaries),
    monthlyExpense: activeSummary?.actual_total_expense ?? null,
    monthlyIncome: activeSummary?.actual_income ?? null,
    netWorth: netWorth?.net_worth ?? null,
    totalAssets: netWorth?.total_assets ?? null,
    totalLiabilities: netWorth?.total_liabilities ?? null,
    transactions: adaptTransactions(transactionLines).slice(0, 4),
  };
}

export async function getAccountsPageData(): Promise<Account[]> {
  const client = await createClient();
  return adaptAccountBalances(await getAccountBalances(client));
}

export async function getBudgetPageData(): Promise<BudgetMonth[]> {
  const client = await createClient();
  const [execution, summaries] = await Promise.all([
    getBudgetExecutionHistory(client),
    getMonthlyFinancialSummaries(client),
  ]);
  return adaptBudgetMonths(execution, summaries);
}

export async function getTransactionsPageData(): Promise<{
  transactions: Transaction[];
}> {
  const client = await createClient();
  return { transactions: adaptTransactions(await getTransactions(client)) };
}

export async function getAnalysisPageData(): Promise<CategorySpending[]> {
  const client = await createClient();
  return adaptMonthlyAnalysis(await getActiveMonthlySummary(client));
}

export async function getExpenseTransactionFormData(): Promise<ExpenseTransactionFormData> {
  const client = await createClient();
  const [accounts, categories, budgetRows] = await Promise.all([
    getAccountBalances(client),
    getExpenseCategories(client),
    getBudgetExecutionHistory(client),
  ]);
  return adaptExpenseTransactionFormData(accounts, categories, budgetRows);
}

function formatShanghaiDateTimeLocal(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export async function getExpenseTransactionEditData(
  entryId: string,
): Promise<ExpenseTransactionEditData | null> {
  const client = await createClient();
  const [editRows, accounts, categories, budgetRows] = await Promise.all([
    getExpenseTransactionForEdit(client, entryId),
    getAccountBalances(client),
    getExpenseCategories(client),
    getBudgetExecutionHistory(client),
  ]);
  const [transaction] = adaptTransactions(editRows.transactionLines);
  const primaryLine = editRows.transactionLines.toSorted(
    (left, right) => left.line_sort_order - right.line_sort_order,
  )[0];

  if (!transaction?.editable || !primaryLine || editRows.budgetImpacts.length > 1) {
    return null;
  }

  const impact = editRows.budgetImpacts[0] ?? null;
  const impactPeriod = impact
    ? budgetRows.find((row) => row.budget_period_id === impact.budget_period_id)
    : null;

  return {
    formData: adaptExpenseTransactionFormData(accounts, categories, budgetRows),
    initialValues: {
      accountId: primaryLine.account_id,
      amount: Math.abs(primaryLine.amount),
      budgetBucketId: impact?.budget_bucket_id ?? "",
      budgetLocked: impactPeriod?.period_status === "closed",
      categoryId: primaryLine.category_id ?? "",
      description: primaryLine.description,
      entryId: primaryLine.entry_id,
      excludeFromBudget: primaryLine.exclude_from_budget,
      occurredAt: formatShanghaiDateTimeLocal(primaryLine.occurred_at),
    },
  };
}
