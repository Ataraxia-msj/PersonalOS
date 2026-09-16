import type {
  Account,
  BudgetMonth,
  BudgetFormData,
  CategorySpending,
  ExpenseTransactionFormData,
  IncomeTransactionFormData,
  ExpenseTransactionEditData,
  FinanceOverviewData,
  Transaction,
} from "@/features/finance/types";
import { createClient } from "@/lib/supabase/server";

import {
  adaptAccountBalances,
  adaptBudgetMonths,
  adaptExpenseTransactionFormData,
  adaptIncomeTransactionFormData,
  adaptMonthlyAnalysis,
  adaptMonthlyCashflow,
  adaptNetWorth,
  adaptTransactions,
} from "./adapters";
import {
  getAccountBalances,
  getBudgetBuckets,
  getBudgetPeriods,
  getBudgetAllocations,
  getBudgetSummaries,
  getActiveMonthlySummary,
  getBudgetExecutionHistory,
  getExpenseCategories,
  getIncomeCategories,
  getExpenseTransactionForEdit,
  getMonthlyFinancialSummaries,
  getNetWorth,
  getRecentTransactions,
  getTransactions,
  getTransactionAccountCurrencies,
} from "./queries";
import { shanghaiDate } from "./budget-validation";

export async function getFinanceOverviewData(): Promise<FinanceOverviewData> {
  const client = await createClient();
  const [netWorthRow, activeSummary, monthlySummaries, transactionLines, currencies] = await Promise.all([
    getNetWorth(client),
    getActiveMonthlySummary(client),
    getMonthlyFinancialSummaries(client),
    getRecentTransactions(client),
    getTransactionAccountCurrencies(client),
  ]);
  const netWorth = adaptNetWorth(netWorthRow);

  return {
    cashflow: adaptMonthlyCashflow(monthlySummaries),
    monthlyExpense: activeSummary?.actual_total_expense ?? null,
    monthlyIncome: activeSummary?.actual_income ?? null,
    netWorth: netWorth?.net_worth ?? null,
    totalAssets: netWorth?.total_assets ?? null,
    totalLiabilities: netWorth?.total_liabilities ?? null,
    transactions: adaptTransactions(transactionLines, currencies).slice(0, 4),
  };
}

export async function getAccountsPageData(): Promise<Account[]> {
  const client = await createClient();
  return adaptAccountBalances(await getAccountBalances(client));
}

export async function getBudgetPageData(): Promise<BudgetMonth[]> {
  const client = await createClient();
  const [execution, summaries, periods] = await Promise.all([
    getBudgetExecutionHistory(client),
    getBudgetSummaries(client),
    getBudgetPeriods(client),
  ]);
  const months = adaptBudgetMonths(execution, summaries);
  for (const period of periods) {
    if (months.some((month) => month.id === period.id)) continue;
    const summary = summaries.find((row) => row.budget_period_id === period.id);
    months.push({ id: period.id, label: `${period.start_date.slice(0, 4)}年${Number(period.start_date.slice(5, 7))}月`,
      status: period.status, editable: period.status === "active", sections: [], executionRate: null,
      plannedTotal: summary?.planned_total_allocated ?? 0, actualTotal: 0, remainingTotal: summary?.planned_total_allocated ?? 0 });
  }
  const order = new Map(periods.map((period, index) => [period.id, index]));
  return months.toSorted((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function getTransactionsPageData(): Promise<{
  transactions: Transaction[];
}> {
  const client = await createClient();
  const [lines, currencies] = await Promise.all([getTransactions(client), getTransactionAccountCurrencies(client)]);
  return { transactions: adaptTransactions(lines, currencies) };
}

export async function getAnalysisPageData(): Promise<CategorySpending[]> {
  const client = await createClient();
  return adaptMonthlyAnalysis(await getActiveMonthlySummary(client));
}

export async function getExpenseTransactionFormData(): Promise<ExpenseTransactionFormData> {
  const client = await createClient();
  const [accounts, categories, budgetRows, buckets] = await Promise.all([
    getAccountBalances(client),
    getExpenseCategories(client),
    getBudgetExecutionHistory(client),
    getBudgetBuckets(client),
  ]);
  return adaptExpenseTransactionFormData(accounts, categories, budgetRows, buckets);
}

export async function getIncomeTransactionFormData(): Promise<IncomeTransactionFormData> {
  const client = await createClient();
  const [accounts, categories] = await Promise.all([
    getAccountBalances(client),
    getIncomeCategories(client),
  ]);
  return adaptIncomeTransactionFormData(accounts, categories);
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
  const [editRows, accounts, categories, budgetRows, buckets] = await Promise.all([
    getExpenseTransactionForEdit(client, entryId),
    getAccountBalances(client),
    getExpenseCategories(client),
    getBudgetExecutionHistory(client),
    getBudgetBuckets(client),
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
    formData: adaptExpenseTransactionFormData(accounts, categories, budgetRows, buckets),
    initialValues: {
      accountId: primaryLine.account_id,
      amount: Math.abs(primaryLine.amount),
      budgetBucketId: primaryLine.saved_budget_bucket_id ?? impact?.budget_bucket_id ?? "",
      budgetLocked: impactPeriod?.period_status === "closed",
      categoryId: primaryLine.category_id ?? "",
      description: primaryLine.description,
      entryId: primaryLine.entry_id,
      excludeFromBudget: primaryLine.exclude_from_budget,
      occurredAt: formatShanghaiDateTimeLocal(primaryLine.occurred_at),
    },
  };
}

export async function getBudgetFormData(periodId?: string): Promise<BudgetFormData | null> {
  const client = await createClient();
  const [periods, buckets, allocations] = await Promise.all([
    getBudgetPeriods(client), getBudgetBuckets(client),
    periodId ? getBudgetAllocations(client, periodId) : Promise.resolve([]),
  ]);
  const period = periodId ? periods.find((item) => item.id === periodId) : null;
  if (periodId && !period) return null;
  const amountByBucket = new Map(allocations.map((row) => [row.budget_bucket_id, row.planned_amount]));
  return {
    defaultMonth: shanghaiDate().slice(0, 7),
    period: period ? { id: period.id, month: period.start_date.slice(0, 7), income: period.planned_income,
      updatedAt: period.updated_at, status: period.status, currency: period.currency } : null,
    periods: periods.map((row) => ({ id: row.id, startDate: row.start_date, endDate: row.end_date })),
    buckets: buckets.filter((row) => row.is_active || amountByBucket.has(row.id)).map((row) => ({
      id: row.id, name: row.name, kind: row.bucket_kind, active: row.is_active, amount: amountByBucket.get(row.id) ?? null,
    })),
  };
}
