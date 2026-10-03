import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";

import {
  getAccountBalances,
  getActiveBudgetExecution,
  getActiveMonthlySummary,
  getBudgetExecutionHistory,
  getBudgetBuckets,
  getBudgetPeriods,
  getBudgetSummaries,
  getBudgetAllocations,
  getExpenseCategories,
  getIncomeCategories,
  getExpenseTransactionForEdit,
  getFinancialInsights,
  getMonthlyCategorySpending,
  getMonthlyFinancialAnalysis,
  getMonthlyFinancialSummaries,
  getNetWorth,
  getRecentTransactions,
  getTransactions,
  getTransactionAccountCurrencies,
} from "./queries";
import type { MonthlyFinancialAnalysisView, TransactionDetailView } from "./types";
import {
  getAccountsPageData,
  getAnalysisPageData,
  getBudgetPageData,
  getBudgetFormData,
  getFinanceOverviewData,
  getExpenseTransactionFormData,
  getIncomeTransactionFormData,
  getExpenseTransactionEditData,
  getTransactionsPageData,
} from "./service";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("./queries", () => ({
  getAccountBalances: vi.fn(),
  getActiveBudgetExecution: vi.fn(),
  getActiveMonthlySummary: vi.fn(),
  getBudgetExecutionHistory: vi.fn(),
  getBudgetBuckets: vi.fn(),
  getBudgetPeriods: vi.fn(),
  getBudgetSummaries: vi.fn(),
  getBudgetAllocations: vi.fn(),
  getExpenseCategories: vi.fn(),
  getIncomeCategories: vi.fn(),
  getExpenseTransactionForEdit: vi.fn(),
  getFinancialInsights: vi.fn(),
  getMonthlyCategorySpending: vi.fn(),
  getMonthlyFinancialAnalysis: vi.fn(),
  getMonthlyFinancialSummaries: vi.fn(),
  getNetWorth: vi.fn(),
  getRecentTransactions: vi.fn(),
  getTransactions: vi.fn(),
  getTransactionAccountCurrencies: vi.fn(),
}));

const client = {} as never;
const transactionLine = (
  overrides: Partial<TransactionDetailView> = {},
): TransactionDetailView => ({
  account_class: "asset",
  account_id: "account-daily",
  account_name: "日常账户",
  account_type: "bank",
  amount: -38,
  category_id: "category-food",
  category_name: "餐饮",
  category_type: "expense",
  saved_budget_bucket_id: null,
  saved_budget_bucket_name: null,
  budget_bucket_id: null,
  budget_bucket_name: null,
  budget_period_end_date: null,
  budget_period_id: null,
  budget_period_start_date: null,
  description: "午餐",
  exclude_from_budget: false,
  entry_id: "entry-lunch",
  entry_type: "expense",
  institution: "招商银行",
  line_id: "line-1",
  line_sort_order: 1,
  memo: null,
  occurred_at: "2026-09-04T12:30:00+08:00",
  related_entry_id: null,
  source: "manual",
  status: "confirmed",
  ...overrides,
});

const analysisRow = (
  overrides: Partial<MonthlyFinancialAnalysisView> = {},
): MonthlyFinancialAnalysisView => ({
  actual_income: 12000, actual_saving: 1800, actual_total_allocated: 6400,
  actual_total_expense: 4100, balance_mom_change: 400, balance_mom_rate: 5.33,
  balance_yoy_change: null, balance_yoy_rate: null, budget_period_id: "period-2026-09",
  currency: "CNY", expense_mom_change: 100, expense_mom_rate: 2.5,
  expense_yoy_change: null, expense_yoy_rate: null, income_mom_change: 1000,
  income_mom_rate: 9.09, income_yoy_change: null, income_yoy_rate: null,
  month: "2026-09-01", monthly_balance: 7900, net_worth_as_of: 180000,
  net_worth_change: 3000, overall_execution_rate: 87.67, planned_total_allocated: 7300,
  previous_month_balance: 7500, previous_month_execution_rate: 80,
  previous_month_expense: 4000, previous_month_income: 11000,
  previous_month_saving_rate: 12, prior_year_balance: null, prior_year_expense: null,
  prior_year_income: null, saving_rate: 15, status: "active", summary_as_of: "2026-09-15",
  ...overrides,
});

describe("Finance service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(client);
    vi.mocked(getNetWorth).mockResolvedValue({
      currency: "CNY",
      net_worth: 160000,
      total_assets: 200000,
      total_liabilities: 40000,
    });
    vi.mocked(getAccountBalances).mockResolvedValue([]);
    vi.mocked(getActiveBudgetExecution).mockResolvedValue([]);
    vi.mocked(getBudgetExecutionHistory).mockResolvedValue([]);
    vi.mocked(getBudgetBuckets).mockResolvedValue([]);
    vi.mocked(getBudgetPeriods).mockResolvedValue([]);
    vi.mocked(getBudgetSummaries).mockResolvedValue([]);
    vi.mocked(getBudgetAllocations).mockResolvedValue([]);
    vi.mocked(getExpenseCategories).mockResolvedValue([]);
    vi.mocked(getIncomeCategories).mockResolvedValue([]);
    vi.mocked(getExpenseTransactionForEdit).mockResolvedValue({
      budgetImpacts: [],
      transactionLines: [],
    });
    vi.mocked(getActiveMonthlySummary).mockResolvedValue(null);
    vi.mocked(getMonthlyFinancialSummaries).mockResolvedValue([]);
    vi.mocked(getMonthlyFinancialAnalysis).mockResolvedValue([]);
    vi.mocked(getMonthlyCategorySpending).mockResolvedValue([]);
    vi.mocked(getFinancialInsights).mockResolvedValue([]);
    vi.mocked(getRecentTransactions).mockResolvedValue([]);
    vi.mocked(getTransactions).mockResolvedValue([]);
    vi.mocked(getTransactionAccountCurrencies).mockResolvedValue([]);
  });

  it("builds overview data from net worth, monthly, and recent transaction Views", async () => {
    vi.mocked(getActiveMonthlySummary).mockResolvedValue({
      actual_debt: 0,
      actual_expense: 38,
      actual_income: 0,
      actual_investment: 0,
      actual_saving: 0,
      actual_total_allocated: 38,
      actual_total_expense: 138,
      actual_unallocated: -38,
      budget_period_id: "period-2026-09",
      currency: "CNY",
      end_date: "2026-09-30",
      expense_variance: -962,
      missing_current_snapshots: 0,
      missing_start_snapshots: 0,
      net_worth_as_of: null,
      net_worth_change: null,
      net_worth_start: null,
      monthly_balance: -138,
      overall_execution_rate: 3.8,
      planned_debt: 0,
      planned_expense: 1000,
      planned_income: 0,
      planned_investment: 0,
      planned_saving: 0,
      planned_total_allocated: 1000,
      planned_unallocated: -1000,
      saving_rate: null,
      start_date: "2026-09-01",
      status: "active",
      summary_as_of: "2026-09-04T12:30:00+08:00",
    });
    vi.mocked(getRecentTransactions).mockResolvedValue([
      transactionLine(),
      transactionLine({
        account_id: "account-clearing",
        account_name: "消费清算",
        amount: 38,
        line_id: "line-2",
        line_sort_order: 2,
      }),
    ]);
    const data = await getFinanceOverviewData();

    expect(data.totalAssets).toBe(200000);
    expect(data.totalLiabilities).toBe(40000);
    expect(data.netWorth).toBe(160000);
    expect(data.monthlyExpense).toBe(138);
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0]).toMatchObject({
      accountName: "日常账户 / 消费清算",
      amount: -38,
      id: "entry-lunch",
    });
    expect(getNetWorth).toHaveBeenCalledWith(client);
    expect(getMonthlyFinancialSummaries).toHaveBeenCalledWith(client);
    expect(getRecentTransactions).toHaveBeenCalledWith(client);
  });

  it("reads and groups the full transaction list independently of account data", async () => {
    vi.mocked(getTransactions).mockResolvedValue([
      transactionLine(),
      transactionLine({ line_id: "line-2", line_sort_order: 2 }),
    ]);
    const accounts = await getAccountsPageData();
    const transactions = await getTransactionsPageData();

    expect(accounts).toEqual([]);
    expect(transactions.transactions).toHaveLength(1);
    expect(transactions.transactions[0]?.id).toBe("entry-lunch");
    expect(getTransactions).toHaveBeenCalledWith(client);
  });

  it("uses complete execution history for current and closed budget periods", async () => {
    const data = await getBudgetPageData();

    expect(data).toEqual([]);
    expect(getBudgetExecutionHistory).toHaveBeenCalledWith(client);
    expect(getBudgetSummaries).toHaveBeenCalledWith(client);
    expect(getBudgetPeriods).toHaveBeenCalledWith(client);
  });

  it("uses the latest analysis month by default and loads its independent detail Views", async () => {
    vi.mocked(getMonthlyFinancialAnalysis).mockResolvedValue([
      analysisRow(),
      analysisRow({ month: "2026-08-01", budget_period_id: "period-2026-08" }),
    ]);

    const data = await getAnalysisPageData();

    expect(data.selectedMonth).toBe("2026-09");
    expect(data.availableMonths).toHaveLength(2);
    expect(data.summary?.income.value).toBe(12000);
    expect(getMonthlyCategorySpending).toHaveBeenCalledWith(client, "2026-09-01");
    expect(getFinancialInsights).toHaveBeenCalledWith(client, "2026-09-01");
    expect(getBudgetExecutionHistory).toHaveBeenCalledWith(client);
    expect(createClient).toHaveBeenCalledOnce();
  });

  it("honors an explicit available month without silently substituting another month", async () => {
    vi.mocked(getMonthlyFinancialAnalysis).mockResolvedValue([
      analysisRow({ month: "2026-08-01", budget_period_id: "period-2026-08" }),
    ]);
    await expect(getAnalysisPageData("2026-08")).resolves.toMatchObject({ selectedMonth: "2026-08" });
    expect(getMonthlyFinancialAnalysis).toHaveBeenCalledWith(client, "2026-08-01");

    vi.mocked(getMonthlyFinancialAnalysis).mockResolvedValue([
      analysisRow({ month: "2026-07-01", budget_period_id: "period-2026-07" }),
    ]);
    await expect(getAnalysisPageData("2026-08")).resolves.toMatchObject({ selectedMonth: null, summary: null });
  });

  it("starts independent selected-month reads together after resolving the month", async () => {
    vi.mocked(getMonthlyFinancialAnalysis).mockResolvedValue([analysisRow()]);
    let releaseCategories!: (value: never[]) => void;
    let releaseInsights!: (value: never[]) => void;
    let releaseExecution!: (value: never[]) => void;
    vi.mocked(getMonthlyCategorySpending).mockImplementation(() => new Promise((resolve) => { releaseCategories = resolve; }));
    vi.mocked(getFinancialInsights).mockImplementation(() => new Promise((resolve) => { releaseInsights = resolve; }));
    vi.mocked(getBudgetExecutionHistory).mockImplementation(() => new Promise((resolve) => { releaseExecution = resolve; }));

    const pending = getAnalysisPageData();
    await vi.waitFor(() => {
      expect(getMonthlyCategorySpending).toHaveBeenCalledOnce();
      expect(getFinancialInsights).toHaveBeenCalledOnce();
      expect(getBudgetExecutionHistory).toHaveBeenCalledOnce();
    });
    releaseCategories([]);
    releaseInsights([]);
    releaseExecution([]);
    await pending;
  });

  it("does not swallow analysis View errors", async () => {
    vi.mocked(getMonthlyFinancialAnalysis).mockRejectedValue(new Error("analysis denied"));
    await expect(getAnalysisPageData()).rejects.toThrow("analysis denied");
  });

  it("loads independent expense form options through one server client", async () => {
    await expect(getExpenseTransactionFormData()).resolves.toEqual({
      accounts: [],
      budgetPeriods: [],
      budgetBuckets: [],
      categories: [],
    });

    expect(createClient).toHaveBeenCalledOnce();
    expect(getAccountBalances).toHaveBeenCalledWith(client);
    expect(getExpenseCategories).toHaveBeenCalledWith(client);
    expect(getBudgetExecutionHistory).toHaveBeenCalledWith(client);
  });

  it("loads income accounts and categories concurrently through one server client", async () => {
    await expect(getIncomeTransactionFormData()).resolves.toEqual({
      accounts: [],
      categories: [],
    });

    expect(createClient).toHaveBeenCalledOnce();
    expect(getAccountBalances).toHaveBeenCalledWith(client);
    expect(getIncomeCategories).toHaveBeenCalledWith(client);
  });

  it("builds editable transaction values from one grouped manual expense", async () => {
    vi.mocked(getExpenseTransactionForEdit).mockResolvedValue({
      budgetImpacts: [{
        amount: 38,
        budget_bucket_id: "bucket-food",
        budget_period_id: "period-2026-09",
        created_at: "2026-09-04T12:30:00+08:00",
        entry_id: "entry-lunch",
        id: "impact-lunch",
        line_id: "line-1",
        note: null,
        source: "manual",
        updated_at: "2026-09-04T12:30:00+08:00",
      }],
      transactionLines: [transactionLine({ exclude_from_budget: true })],
    });
    vi.mocked(getBudgetExecutionHistory).mockResolvedValue([{
      actual_amount: 38,
      budget_bucket_id: "bucket-food",
      budget_bucket_name: "自由消费",
      budget_period_id: "period-2026-09",
      bucket_kind: "expense",
      currency: "CNY",
      end_date: "2026-09-30",
      execution_rate: 3.8,
      period_status: "active",
      planned_amount: 1000,
      planned_income: 10000,
      remaining_amount: 962,
      sort_order: 2,
      start_date: "2026-09-01",
    }]);

    await expect(getExpenseTransactionEditData("entry-lunch")).resolves.toMatchObject({
      initialValues: {
        accountId: "account-daily",
        amount: 38,
        budgetBucketId: "bucket-food",
        budgetLocked: false,
        categoryId: "category-food",
        description: "午餐",
        entryId: "entry-lunch",
        excludeFromBudget: true,
        occurredAt: "2026-09-04T12:30",
      },
    });
  });

  it("restores the persisted transaction bucket when there is no period or impact", async () => {
    vi.mocked(getExpenseTransactionForEdit).mockResolvedValue({ budgetImpacts: [], transactionLines: [transactionLine({
      saved_budget_bucket_id: "chosen", saved_budget_bucket_name: "变动必要开销",
    })] });
    const result = await getExpenseTransactionEditData("entry-lunch");
    expect(result?.initialValues.budgetBucketId).toBe("chosen");
    expect(result?.initialValues.budgetLocked).toBe(false);
  });

  it("reads independent real bucket options for a new month without inventing allocations", async () => {
    vi.mocked(getBudgetBuckets).mockResolvedValue([{
      id: "bucket-real", name: "真实分类", bucket_kind: "expense", is_active: true, sort_order: 0,
      note: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
    }]);
    const result = await getBudgetFormData();
    expect(result?.period).toBeNull();
    expect(result?.buckets).toEqual([{ id: "bucket-real", name: "真实分类", kind: "expense", active: true, amount: null }]);
    expect(getBudgetAllocations).not.toHaveBeenCalled();
    expect(createClient).toHaveBeenCalledOnce();
  });
});
