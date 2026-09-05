import type {
  Account,
  BudgetCategory,
  BudgetMonth,
  BudgetSection,
  CategorySpending,
  ExpenseTransactionFormData,
  MonthlyCashflow,
  Transaction,
} from "@/features/finance/types";

import type {
  AccountBalanceView,
  BudgetExecutionView,
  ExpenseCategoryRow,
  MonthlyFinancialSummaryView,
  NetWorthView,
  TransactionDetailView,
} from "./types";

const spendingOrder = ["固定必要开销", "变动必要开销", "自由消费"];
const allocationOrder = ["储蓄", "投资", "还款"];
const palette: BudgetCategory["color"][] = ["terracotta", "sand", "slate", "rose"];
const transactionTypeLabels: Record<TransactionDetailView["entry_type"], string> = {
  adjustment: "调整",
  expense: "支出",
  income: "收入",
  refund: "退款",
  transfer: "转账",
};

function getAccountVisualType(row: AccountBalanceView): Account["type"] {
  if (row.account_class === "liability") return "credit";
  if (row.account_type === "investment") return "investment";
  if (row.account_type === "money_market" || row.account_type === "time_deposit") {
    return "savings";
  }
  return "cash";
}

function formatMonth(value: string) {
  const [year, month] = value.split("-");
  return `${year}年${Number(month)}月`;
}

function normalizeBucketName(row: BudgetExecutionView) {
  const aliases: Record<string, string> = {
    固定必要: "固定必要开销",
    变动必要: "变动必要开销",
  };
  return aliases[row.budget_bucket_name] ?? row.budget_bucket_name;
}

function categoryOrder(name: string, section: BudgetSection["id"]) {
  const order = section === "spending" ? spendingOrder : allocationOrder;
  const index = order.indexOf(name);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function adaptNetWorth(row: NetWorthView | null): NetWorthView | null {
  return row ? { ...row } : null;
}

export function adaptAccountBalances(rows: AccountBalanceView[]): Account[] {
  return rows.map((row) => ({
    balance: row.estimated_balance,
    id: row.account_id,
    institution: row.institution ?? row.currency,
    name: row.account_name,
    type: getAccountVisualType(row),
  }));
}

export function adaptTransactions(rows: TransactionDetailView[]): Transaction[] {
  const linesByEntry = new Map<string, TransactionDetailView[]>();

  for (const row of rows) {
    const lines = linesByEntry.get(row.entry_id) ?? [];
    lines.push(row);
    linesByEntry.set(row.entry_id, lines);
  }

  return Array.from(linesByEntry.values()).map((lines) => {
    const orderedLines = lines.toSorted(
      (left, right) => left.line_sort_order - right.line_sort_order,
    );
    const primaryLine = orderedLines[0];
    const accountName = Array.from(new Set(orderedLines.map((line) => line.account_name))).join(" / ");
    const categoryNames = Array.from(
      new Set(orderedLines.flatMap((line) => line.category_name ? [line.category_name] : [])),
    );
    const icon: Transaction["icon"] =
      primaryLine.entry_type === "expense"
        ? "shopping-bag"
        : primaryLine.entry_type === "transfer" || primaryLine.entry_type === "adjustment"
          ? "bank"
          : "briefcase";

    return {
      accountId: primaryLine.account_id,
      accountName,
      amount: primaryLine.entry_type === "expense"
        ? -Math.abs(primaryLine.amount)
        : primaryLine.amount,
      category: categoryNames.join(" / ") || transactionTypeLabels[primaryLine.entry_type],
      date: primaryLine.occurred_at.slice(0, 10),
      editable:
        primaryLine.entry_type === "expense"
        && primaryLine.source === "manual"
        && primaryLine.status === "confirmed"
        && orderedLines.length === 1,
      excludedFromBudget: primaryLine.exclude_from_budget,
      budgetLabel: primaryLine.exclude_from_budget
        ? "不计入预算"
        : primaryLine.budget_period_start_date && primaryLine.budget_bucket_name
          ? `${formatMonth(primaryLine.budget_period_start_date)} · ${primaryLine.budget_bucket_name}`
          : "未归入预算",
      icon,
      id: primaryLine.entry_id,
      merchant: primaryLine.description,
    };
  });
}

export function adaptMonthlyCashflow(rows: MonthlyFinancialSummaryView[]): MonthlyCashflow[] {
  return rows
    .filter((row) => (
      Number.isFinite(row.actual_income)
      && Number.isFinite(row.actual_total_expense)
    ))
    .toSorted((left, right) => left.start_date.localeCompare(right.start_date))
    .map((row) => ({
      expense: row.actual_total_expense,
      income: row.actual_income,
      month: `${Number(row.start_date.slice(5, 7))}月`,
    }));
}

export function adaptExpenseTransactionFormData(
  accounts: AccountBalanceView[],
  categories: ExpenseCategoryRow[],
  budgetRows: BudgetExecutionView[],
): ExpenseTransactionFormData {
  const periods = new Map<string, ExpenseTransactionFormData["budgetPeriods"][number]>();

  for (const row of budgetRows) {
    const period = periods.get(row.budget_period_id) ?? {
      buckets: [],
      endDate: row.end_date,
      id: row.budget_period_id,
      startDate: row.start_date,
      status: row.period_status,
    };
    period.buckets.push({
      id: row.budget_bucket_id,
      kind: row.bucket_kind,
      name: row.budget_bucket_name,
    });
    periods.set(row.budget_period_id, period);
  }

  return {
    accounts: accounts.map((account) => ({
      accountClass: account.account_class,
      balance: account.estimated_balance,
      currency: account.currency,
      id: account.account_id,
      institution: account.institution,
      name: account.account_name,
    })),
    budgetPeriods: Array.from(periods.values()).toSorted((left, right) =>
      right.startDate.localeCompare(left.startDate),
    ),
    categories: categories.map((category) => ({
      defaultBudgetBucketId: category.default_budget_bucket_id,
      id: category.id,
      name: category.name,
    })),
  };
}

export function adaptMonthlyAnalysis(
  row: MonthlyFinancialSummaryView | null,
): CategorySpending[] {
  if (!row) return [];

  return [
    { amount: row.actual_expense, category: "支出" },
    { amount: row.actual_saving, category: "储蓄" },
    { amount: row.actual_investment, category: "投资" },
    { amount: row.actual_debt, category: "还款" },
  ];
}

export function adaptBudgetMonths(
  rows: BudgetExecutionView[],
  summaries: MonthlyFinancialSummaryView[],
): BudgetMonth[] {
  const periods = new Map<string, BudgetExecutionView[]>();
  const summaryByPeriod = new Map(summaries.map((item) => [item.budget_period_id, item]));
  const historyByBucket = new Map<string, Array<{ date: string; amount: number }>>();

  for (const row of rows) {
    const periodRows = periods.get(row.budget_period_id) ?? [];
    periodRows.push(row);
    periods.set(row.budget_period_id, periodRows);

    const name = normalizeBucketName(row);
    const history = historyByBucket.get(name) ?? [];
    history.push({ amount: row.actual_amount, date: row.start_date });
    historyByBucket.set(name, history);
  }

  return Array.from(periods.entries())
    .toSorted(([, leftRows], [, rightRows]) =>
      rightRows[0].start_date.localeCompare(leftRows[0].start_date),
    )
    .map(([periodId, periodRows]) => {
    const orderedRows = periodRows.toSorted((left, right) => left.sort_order - right.sort_order);
    const first = orderedRows[0];
    const summary = summaryByPeriod.get(periodId);
    const categories = orderedRows.map((row, index): BudgetCategory => {
      const name = normalizeBucketName(row);
      const trend = (historyByBucket.get(name) ?? [])
        .toSorted((left, right) => left.date.localeCompare(right.date))
        .map((point) => point.amount);
      const history = (historyByBucket.get(name) ?? [])
        .toSorted((left, right) => left.date.localeCompare(right.date));
      const currentIndex = history.findIndex((point) => point.date === row.start_date);
      const previousAmount = currentIndex > 0 ? history[currentIndex - 1]?.amount : null;
      return {
        category: name,
        changeFromPrevious:
          previousAmount === null || previousAmount === undefined
            ? null
            : row.actual_amount - previousAmount,
        color: palette[index % palette.length],
        executionRate: row.execution_rate,
        id: row.budget_bucket_id,
        limit: row.planned_amount,
        remaining: row.remaining_amount,
        spent: row.actual_amount,
        trend,
      };
    });
    const spending = categories
      .filter((category) => spendingOrder.includes(category.category))
      .toSorted((left, right) => categoryOrder(left.category, "spending") - categoryOrder(right.category, "spending"));
    const allocation = categories
      .filter((category) => allocationOrder.includes(category.category))
      .toSorted((left, right) => categoryOrder(left.category, "allocation") - categoryOrder(right.category, "allocation"));
    const uncategorized = categories.filter(
      (category) => !spending.includes(category) && !allocation.includes(category),
    );
    spending.push(...uncategorized.filter((category) => {
      const source = orderedRows.find((row) => row.budget_bucket_id === category.id);
      return source?.bucket_kind === "expense";
    }));
    allocation.push(...uncategorized.filter((category) => !spending.includes(category)));

    return {
      actualTotal: orderedRows.reduce((total, row) => total + row.actual_amount, 0),
      editable: first.period_status !== "closed",
      executionRate: null,
      id: periodId,
      label: formatMonth(first.start_date),
      plannedTotal:
        summary?.planned_total_allocated ??
        orderedRows.reduce((total, row) => total + row.planned_amount, 0),
      remainingTotal: orderedRows.reduce((total, row) => total + row.remaining_amount, 0),
      sections: [
        { categories: spending, id: "spending", title: "消费预算" },
        { categories: allocation, id: "allocation", title: "资金安排" },
      ],
    } satisfies BudgetMonth;
    });
}
