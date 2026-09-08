import { describe, expect, it } from "vitest";

import {
  adaptAccountBalances,
  adaptBudgetMonths,
  adaptExpenseTransactionFormData,
  adaptMonthlyAnalysis,
  adaptMonthlyCashflow,
  adaptNetWorth,
  adaptTransactions,
} from "./adapters";
import type {
  AccountBalanceView,
  BudgetExecutionView,
  MonthlyFinancialSummaryView,
  NetWorthView,
  TransactionDetailView,
} from "./types";

const transactionLine = (
  overrides: Partial<TransactionDetailView> & {
    budget_bucket_id?: string | null;
    budget_bucket_name?: string | null;
    budget_period_end_date?: string | null;
    budget_period_id?: string | null;
    budget_period_start_date?: string | null;
  } = {},
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

const summary = (overrides: Partial<MonthlyFinancialSummaryView> = {}): MonthlyFinancialSummaryView => ({
  actual_debt: 200,
  actual_expense: 3500,
  actual_income: 12000,
  actual_investment: 900,
  actual_saving: 1800,
  actual_total_expense: 4200,
  actual_unallocated: 0,
  budget_period_id: "period-2026-09",
  end_date: "2026-09-30",
  expense_variance: 500,
  missing_current_snapshots: 0,
  missing_start_snapshots: 0,
  net_worth_as_of: 180000,
  net_worth_change: 3000,
  net_worth_start: 177000,
  planned_debt: 300,
  planned_expense: 4000,
  planned_income: 12000,
  planned_investment: 1000,
  planned_saving: 2000,
  planned_total_allocated: 7300,
  planned_unallocated: 4700,
  saving_rate: 0.15,
  start_date: "2026-09-01",
  status: "active",
  summary_as_of: "2026-09-15",
  currency: "CNY",
  ...overrides,
});

const bucket = (name: string, kind: BudgetExecutionView["bucket_kind"], order: number): BudgetExecutionView => ({
  actual_amount: 500 + order,
  budget_bucket_id: `bucket-${order}`,
  budget_bucket_name: name,
  budget_period_id: "period-2026-09",
  bucket_kind: kind,
  currency: "CNY",
  end_date: "2026-09-30",
  execution_rate: 0.42 + order / 100,
  period_status: "active",
  planned_amount: 1000 + order,
  planned_income: 12000,
  remaining_amount: 500,
  sort_order: order,
  start_date: "2026-09-01",
});

describe("Finance View adapters", () => {
  it("shows independently saved classification before a monthly budget exists", () => {
    const [transaction] = adaptTransactions([transactionLine({
      saved_budget_bucket_id: "saved-bucket", saved_budget_bucket_name: "变动必要开销",
    })]);
    expect(transaction.budgetLabel).toBe("变动必要开销 · 未计入预算");
  });
  it("uses the View's total assets without rebuilding net worth", () => {
    const row: NetWorthView = {
      currency: "CNY",
      net_worth: 160000,
      total_assets: 200000,
      total_liabilities: 40000,
    };

    expect(adaptNetWorth(row)).toEqual(row);
  });

  it("maps estimated balances and account classes to the existing visual model", () => {
    const rows: AccountBalanceView[] = [{
      account_class: "liability",
      account_id: "credit-1",
      account_name: "旅行信用卡",
      account_type: "credit_card",
      balance_source: "snapshot_plus_ledger",
      currency: "CNY",
      estimated_balance: -2400,
      include_in_net_worth: true,
      institution: "Visa",
      is_active: true,
      latest_snapshot_at: null,
      latest_snapshot_balance: null,
      ledger_change_after_snapshot: -2400,
      sort_order: 1,
    }];

    expect(adaptAccountBalances(rows)).toEqual([{
      balance: -2400,
      id: "credit-1",
      institution: "Visa",
      name: "旅行信用卡",
      type: "credit",
    }]);
  });

  it("sorts monthly summaries chronologically for the trend chart", () => {
    const rows = [
      summary(),
      summary({ budget_period_id: "period-2026-08", start_date: "2026-08-01", actual_income: 11000 }),
    ];

    expect(adaptMonthlyCashflow(rows)).toEqual([
      { expense: 4200, income: 11000, month: "8月" },
      { expense: 4200, income: 12000, month: "9月" },
    ]);
  });

  it("omits trend points missing the total-expense View field without inventing a fallback", () => {
    const incompleteRow = summary({
      actual_total_expense: undefined as unknown as number,
    });

    expect(adaptMonthlyCashflow([incompleteRow])).toEqual([]);
  });

  it("maps the active monthly summary into View-backed analysis rows", () => {
    expect(adaptMonthlyAnalysis(summary())).toEqual([
      { amount: 3500, category: "支出" },
      { amount: 1800, category: "储蓄" },
      { amount: 900, category: "投资" },
      { amount: 200, category: "还款" },
    ]);
  });

  it("places all six buckets into two regions and preserves database execution rates", () => {
    const rows = [
      bucket("固定必要开销", "expense", 1),
      bucket("变动必要开销", "expense", 2),
      bucket("自由消费", "expense", 3),
      bucket("储蓄", "saving", 4),
      bucket("投资", "investment", 5),
      bucket("还款", "debt", 6),
    ];

    const [month] = adaptBudgetMonths(rows, [summary()]);

    expect(month.sections.map((section) => ({
      categories: section.categories.map((category) => category.category),
      title: section.title,
    }))).toEqual([
      { title: "消费预算", categories: ["固定必要开销", "变动必要开销", "自由消费"] },
      { title: "资金安排", categories: ["储蓄", "投资", "还款"] },
    ]);
    expect(month.sections[0].categories[0].executionRate).toBe(0.43);
    expect(month.executionRate).toBeNull();
  });

  it("orders budget periods by start date instead of opaque period ids", () => {
    const newest = bucket("固定必要开销", "expense", 1);
    newest.budget_period_id = "00000000-0000-0000-0000-000000000001";
    const older = {
      ...bucket("固定必要开销", "expense", 1),
      budget_period_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      end_date: "2026-08-31",
      start_date: "2026-08-01",
    };

    expect(adaptBudgetMonths([older, newest], []).map((month) => month.id)).toEqual([
      newest.budget_period_id,
      older.budget_period_id,
    ]);
  });

  it("groups transaction lines by entry id and keeps the first line as the display amount", () => {
    const rows = [
      transactionLine(),
      transactionLine({
        account_id: "account-clearing",
        account_name: "消费清算",
        amount: 38,
        line_id: "line-2",
        line_sort_order: 2,
      }),
      transactionLine({
        account_id: "account-savings",
        account_name: "储蓄账户",
        amount: -1000,
        category_id: null,
        category_name: null,
        category_type: null,
        description: "转入储蓄",
        entry_id: "entry-transfer",
        entry_type: "transfer",
        line_id: "line-3",
        occurred_at: "2026-09-03T09:00:00+08:00",
      }),
    ];

    expect(adaptTransactions(rows)).toEqual([
      {
        accountId: "account-daily",
        accountName: "日常账户 / 消费清算",
        accounts: [{ id: "account-daily", name: "日常账户" }, { id: "account-clearing", name: "消费清算" }],
        amount: -38,
        category: "餐饮",
        date: "2026-09-04",
        icon: "shopping-bag",
        id: "entry-lunch",
        merchant: "午餐",
        editable: false,
        excludedFromBudget: false,
        budgetLabel: "预算归属待补充",
      },
      {
        accountId: "account-savings",
        accountName: "储蓄账户",
        accounts: [{ id: "account-savings", name: "储蓄账户" }],
        transfer: { purpose: null, legacy: true, currency: null, lines: expect.any(Array) },
        amount: null,
        category: "转账 · 历史格式",
        date: "2026-09-03",
        icon: "bank",
        id: "entry-transfer",
        merchant: "转入储蓄",
        editable: false,
        excludedFromBudget: false,
        budgetLabel: "—",
      },
    ]);
  });

  it("presents liability-account expenses as negative spending", () => {
    const [transaction] = adaptTransactions([
      transactionLine({ account_class: "liability", amount: 42 }),
    ]);

    expect(transaction.amount).toBe(-42);
  });

  it("marks only confirmed manual single-line expenses editable and exposes budget exclusion", () => {
    const [editable, imported, multiLine] = adaptTransactions([
      transactionLine({
        entry_id: "entry-editable",
        exclude_from_budget: true,
      }),
      transactionLine({
        entry_id: "entry-imported",
        source: "import",
      }),
      transactionLine({
        entry_id: "entry-multi",
        line_id: "line-multi-1",
      }),
      transactionLine({
        entry_id: "entry-multi",
        line_id: "line-multi-2",
        line_sort_order: 2,
      }),
    ]);

    expect(editable).toMatchObject({ editable: true, excludedFromBudget: true });
    expect(imported.editable).toBe(false);
    expect(multiLine.editable).toBe(false);
  });

  it("maps the View budget period and bucket into a transaction label", () => {
    const [budgeted, excluded, unassigned] = adaptTransactions([
      transactionLine({
        budget_bucket_id: "bucket-free",
        budget_bucket_name: "自由消费",
        budget_period_end_date: "2026-09-30",
        budget_period_id: "period-september",
        budget_period_start_date: "2026-09-01",
        entry_id: "entry-budgeted",
      }),
      transactionLine({ entry_id: "entry-excluded", exclude_from_budget: true }),
      transactionLine({ entry_id: "entry-unassigned" }),
    ]);

    expect(budgeted.budgetLabel).toBe("2026年9月 · 自由消费");
    expect(excluded.budgetLabel).toBe("不计入预算");
    expect(unassigned.budgetLabel).toBe("预算归属待补充");
  });

  it("builds real form options and groups budget buckets by period", () => {
    const accountRows: AccountBalanceView[] = [{
      account_class: "asset",
      account_id: "account-daily",
      account_name: "日常账户",
      account_type: "bank",
      balance_source: "ledger_only",
      currency: "CNY",
      estimated_balance: 1200,
      include_in_net_worth: true,
      institution: "招商银行",
      is_active: true,
      latest_snapshot_at: null,
      latest_snapshot_balance: null,
      ledger_change_after_snapshot: 1200,
      sort_order: 0,
    }];
    const budgetRows = [
      bucket("固定必要开销", "expense", 0),
      bucket("自由消费", "expense", 1),
    ];

    expect(adaptExpenseTransactionFormData(accountRows, [{
      category_type: "expense",
      created_at: "2026-09-01T00:00:00Z",
      default_budget_bucket_id: "bucket-0",
      id: "category-food",
      is_active: true,
      name: "餐饮",
      note: null,
      parent_id: null,
      sort_order: 0,
      updated_at: "2026-09-01T00:00:00Z",
    }], budgetRows)).toEqual({
      accounts: [{
        accountClass: "asset",
        balance: 1200,
        currency: "CNY",
        id: "account-daily",
        institution: "招商银行",
        name: "日常账户",
      }],
      budgetBuckets: [],
      budgetPeriods: [{
        buckets: [
          { id: "bucket-0", kind: "expense", name: "固定必要开销" },
          { id: "bucket-1", kind: "expense", name: "自由消费" },
        ],
        endDate: "2026-09-30",
        id: "period-2026-09",
        startDate: "2026-09-01",
        status: "active",
      }],
      categories: [{
        defaultBudgetBucketId: "bucket-0",
        id: "category-food",
        name: "餐饮",
      }],
    });
  });
});
