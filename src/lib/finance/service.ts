import type {
  Account,
  BudgetMonth,
  BudgetFormData,
  FinanceAnalysisPageData,
  ExpenseTransactionFormData,
  IncomeTransactionFormData,
  IncomeTransactionEditData,
  ExpenseTransactionEditData,
  FinanceOverviewData,
  Transaction,
} from "@/features/finance/types";
import type { TransferTransactionEditData, TransferPurpose } from "./transfer-types";
import { createClient } from "@/lib/supabase/server";

import {
  adaptAccountBalances,
  adaptAnalysisCategories,
  adaptAnalysisInsights,
  adaptAnalysisSummary,
  adaptAnalysisTrend,
  adaptBudgetMonths,
  adaptExpenseTransactionFormData,
  adaptIncomeTransactionFormData,
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
  getFinancialInsights,
  getIncomeCategories,
  getIncomeTransactionForEdit,
  getExpenseTransactionForEdit,
  getMonthlyFinancialSummaries,
  getMonthlyCategorySpending,
  getMonthlyFinancialAnalysis,
  getNetWorth,
  getRecentTransactions,
  getTransactions,
  getTransactionAccountCurrencies,
  getTransferTransactionForEdit,
} from "./queries";
import { shanghaiDate } from "./budget-validation";

export async function getFinanceOverviewData(): Promise<FinanceOverviewData> {
  const client = await createClient();
  const [netWorthRow, activeSummary, monthlySummaries, transactionLines, currencies, budgetBuckets] = await Promise.all([
    getNetWorth(client),
    getActiveMonthlySummary(client),
    getMonthlyFinancialSummaries(client),
    getRecentTransactions(client),
    getTransactionAccountCurrencies(client),
    getBudgetBuckets(client),
  ]);
  const netWorth = adaptNetWorth(netWorthRow);

  return {
    cashflow: adaptMonthlyCashflow(monthlySummaries),
    monthlyExpense: activeSummary?.actual_total_expense ?? null,
    monthlyIncome: activeSummary?.actual_income ?? null,
    netWorth: netWorth?.net_worth ?? null,
    totalAssets: netWorth?.total_assets ?? null,
    totalLiabilities: netWorth?.total_liabilities ?? null,
    transactions: adaptTransactions(transactionLines, currencies, budgetBuckets).slice(0, 4),
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
  const [lines, currencies, budgetBuckets] = await Promise.all([
    getTransactions(client),
    getTransactionAccountCurrencies(client),
    getBudgetBuckets(client),
  ]);
  return { transactions: adaptTransactions(lines, currencies, budgetBuckets) };
}

export async function getAnalysisPageData(month?: string): Promise<FinanceAnalysisPageData> {
  const client = await createClient();
  const monthStart = month ? `${month}-01` : undefined;
  const [analysisRows, periods] = await Promise.all([
    getMonthlyFinancialAnalysis(client, monthStart),
    getBudgetPeriods(client),
  ]);
  const selected = monthStart
    ? analysisRows.find((row) => row.month === monthStart) ?? null
    : analysisRows[0] ?? null;
  const monthRows = periods.length > 0
    ? periods.map((period) => period.start_date)
    : analysisRows.map((row) => row.month);
  const availableMonths = Array.from(new Set(monthRows)).toSorted((left, right) => right.localeCompare(left)).map((value) => ({
    label: `${value.slice(0, 4)}年${Number(value.slice(5, 7))}月`,
    value: value.slice(0, 7),
  }));
  if (!selected) {
    return {
      availableMonths,
      budgetSections: [],
      categories: [],
      currency: null,
      insights: [],
      selectedMonth: null,
      snapshot: null,
      summary: null,
      trend: adaptAnalysisTrend(analysisRows),
    };
  }
  const [categories, insights, execution, netWorth] = await Promise.all([
    getMonthlyCategorySpending(client, selected.month),
    getFinancialInsights(client, selected.month),
    getBudgetExecutionHistory(client),
    getNetWorth(client),
  ]);
  const budget = adaptBudgetMonths(
    execution.filter((row) => row.budget_period_id === selected.budget_period_id),
    [],
  )[0];
  return {
    availableMonths,
    budgetSections: budget?.sections ?? [],
    categories: adaptAnalysisCategories(categories),
    currency: selected.currency,
    insights: adaptAnalysisInsights(insights),
    selectedMonth: selected.month.slice(0, 7),
    snapshot: netWorth ? {
      assets: netWorth.total_assets,
      currency: netWorth.currency,
      liabilities: netWorth.total_liabilities,
      netWorth: netWorth.net_worth,
    } : null,
    summary: adaptAnalysisSummary(selected),
    trend: adaptAnalysisTrend(analysisRows),
  };
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

export async function getIncomeTransactionEditData(
  entryId: string,
): Promise<IncomeTransactionEditData | null> {
  const client = await createClient();
  const [editRows, accounts, categories] = await Promise.all([
    getIncomeTransactionForEdit(client, entryId),
    getAccountBalances(client),
    getIncomeCategories(client),
  ]);
  const [line] = editRows.transactionLines;
  if (editRows.transactionLines.length !== 1 || editRows.budgetImpacts.length !== 0 || !line
    || line.entry_id !== entryId || line.entry_type !== "income" || line.source !== "manual"
    || line.status !== "confirmed" || line.related_entry_id !== null || line.exclude_from_budget
    || line.transfer_purpose != null || line.line_sort_order !== 0 || line.amount <= 0
    || line.account_class !== "asset" || line.category_type !== "income" || !line.category_id
    || line.saved_budget_bucket_id !== null || line.budget_bucket_id !== null) {
    return null;
  }
  return {
    formData: adaptIncomeTransactionFormData(accounts, categories),
    initialValues: {
      accountId: line.account_id,
      amount: line.amount,
      categoryId: line.category_id,
      description: line.description,
      entryId: line.entry_id,
      memo: line.memo ?? "",
      occurredAt: formatShanghaiDateTimeLocal(line.occurred_at),
    },
  };
}

const transferPurposes = new Set<TransferPurpose>(["general", "saving", "investment", "debt"]);

export async function getTransferTransactionEditData(
  entryId: string,
): Promise<TransferTransactionEditData | null> {
  const client = await createClient();
  const [editRows, accounts, buckets, periods] = await Promise.all([
    getTransferTransactionForEdit(client, entryId),
    getAccountBalances(client),
    getBudgetBuckets(client),
    getBudgetPeriods(client),
  ]);
  const ordered = editRows.transactionLines.toSorted((left, right) => left.line_sort_order - right.line_sort_order);
  const [from, to] = ordered;
  const purpose = from?.transfer_purpose ?? null;
  const impact = editRows.budgetImpacts[0] ?? null;
  const impactPeriod = impact ? periods.find((period) => period.id === impact.budget_period_id) : null;
  const closedImpact = impactPeriod?.status === "closed";
  const fromAccount = from ? accounts.find((account) => account.account_id === from.account_id) : null;
  const toAccount = to ? accounts.find((account) => account.account_id === to.account_id) : null;
  const savedBucket = from?.saved_budget_bucket_id
    ? buckets.find((bucket) => bucket.id === from.saved_budget_bucket_id)
    : null;
  if (ordered.length !== 2 || editRows.budgetImpacts.length > 1 || !from || !to
    || from.entry_id !== entryId || to.entry_id !== entryId || from.entry_type !== "transfer"
    || to.entry_type !== "transfer" || from.source !== "manual" || to.source !== "manual"
    || from.status !== "confirmed" || to.status !== "confirmed" || from.related_entry_id !== null
    || to.related_entry_id !== null || !purpose || !transferPurposes.has(purpose)
    || to.transfer_purpose !== purpose || from.line_sort_order !== 0 || to.line_sort_order !== 1
    || from.account_class !== "asset" || to.account_class !== (purpose === "debt" ? "liability" : "asset")
    || !fromAccount || !toAccount || fromAccount.currency !== toAccount.currency
    || from.account_id === to.account_id || from.amount >= 0
    || to.amount !== (purpose === "debt" ? from.amount : -from.amount)
    || from.category_id !== null || to.category_id !== null || to.saved_budget_bucket_id !== null
    || from.memo !== to.memo || from.description !== to.description
    || (purpose === "general" && (!from.exclude_from_budget || !to.exclude_from_budget || from.saved_budget_bucket_id !== null))
    || (purpose !== "general" && (from.exclude_from_budget || to.exclude_from_budget))
    || (from.saved_budget_bucket_id !== null
      && (!savedBucket || !savedBucket.is_active || savedBucket.bucket_kind !== purpose))
    || (impact && (impact.line_id !== from.line_id || (!closedImpact
      && (impact.budget_bucket_id !== from.saved_budget_bucket_id || impact.amount !== -from.amount))))) {
    return null;
  }
  return {
    formData: {
      accounts: accounts.map((account) => ({
        accountClass: account.account_class, balance: account.estimated_balance,
        currency: account.currency, id: account.account_id, institution: account.institution,
        name: account.account_name,
      })),
      budgetBuckets: buckets
        .filter((bucket) => bucket.is_active && ["saving", "investment", "debt"].includes(bucket.bucket_kind))
        .map((bucket) => ({ id: bucket.id, kind: bucket.bucket_kind, name: bucket.name })),
    },
    initialValues: {
      amount: Math.abs(from.amount),
      budgetBucketId: from.saved_budget_bucket_id ?? impact?.budget_bucket_id ?? "",
      budgetLocked: impactPeriod?.status === "closed",
      description: from.description,
      entryId: from.entry_id,
      fromAccountId: from.account_id,
      memo: from.memo ?? "",
      occurredAt: formatShanghaiDateTimeLocal(from.occurred_at),
      purpose,
      toAccountId: to.account_id,
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
