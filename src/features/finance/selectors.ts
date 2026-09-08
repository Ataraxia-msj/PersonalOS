import type {
  CategorySpending,
  FinanceDataset,
  FinanceSummary,
  Transaction,
} from "./types";

export function getFinanceSummary(data: FinanceDataset): FinanceSummary {
  const latestCashflow = data.cashflow.at(-1);

  return {
    totalAssets: data.accounts.reduce((total, account) => total + account.balance, 0),
    monthlyIncome: latestCashflow?.income ?? 0,
    monthlyExpense: latestCashflow?.expense ?? 0,
  };
}

export function getRecentTransactions(data: FinanceDataset, limit = 4): Transaction[] {
  return data.transactions
    .toSorted((left, right) => right.date.localeCompare(left.date))
    .slice(0, Math.max(0, limit));
}

export function getSpendingByCategory(data: FinanceDataset): CategorySpending[] {
  const totals = new Map<string, number>();

  for (const transaction of data.transactions) {
    if (transaction.transfer || transaction.amount === null || transaction.amount >= 0) continue;
    totals.set(
      transaction.category,
      (totals.get(transaction.category) ?? 0) + Math.abs(transaction.amount),
    );
  }

  return Array.from(totals, ([category, amount]) => ({ category, amount })).toSorted(
    (left, right) => right.amount - left.amount,
  );
}
