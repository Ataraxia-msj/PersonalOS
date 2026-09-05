import { describe, expect, it } from "vitest";

import { getFinanceSummary, getRecentTransactions, getSpendingByCategory } from "./selectors";
import type { FinanceDataset } from "./types";

const fixture: FinanceDataset = {
  asOf: "2026-09-02",
  accounts: [
    { id: "cash", name: "现金账户", institution: "个人", type: "cash", balance: 28460.2 },
    { id: "invest", name: "投资账户", institution: "个人", type: "investment", balance: 100000 },
  ],
  transactions: [
    {
      id: "tx-rent",
      date: "2026-09-02",
      merchant: "房租",
      category: "居住",
      accountId: "cash",
      accountName: "现金账户",
      amount: -3800,
      budgetLabel: "未归入预算",
      editable: true,
      excludedFromBudget: false,
      icon: "home",
    },
    {
      id: "tx-salary",
      date: "2026-09-01",
      merchant: "工资",
      category: "收入",
      accountId: "cash",
      accountName: "现金账户",
      amount: 18200,
      budgetLabel: "未归入预算",
      editable: false,
      excludedFromBudget: false,
      icon: "briefcase",
    },
    {
      id: "tx-daily",
      date: "2026-08-31",
      merchant: "日常消费",
      category: "生活",
      accountId: "cash",
      accountName: "现金账户",
      amount: -5880,
      budgetLabel: "不计入预算",
      editable: true,
      excludedFromBudget: true,
      icon: "shopping-bag",
    },
  ],
  budgetMonths: [],
  cashflow: [
    { month: "9月", income: 18200, expense: 9680 },
  ],
};

describe("finance selectors", () => {
  it("derives the displayed summary from accounts and the latest cashflow point", () => {
    expect(getFinanceSummary(fixture)).toEqual({
      totalAssets: 128460.2,
      monthlyIncome: 18200,
      monthlyExpense: 9680,
    });
  });

  it("returns the newest transactions up to the requested limit", () => {
    expect(getRecentTransactions(fixture, 2).map((item) => item.id)).toEqual([
      "tx-rent",
      "tx-salary",
    ]);
  });

  it("groups only expenses by category using positive totals", () => {
    expect(getSpendingByCategory(fixture)).toEqual([
      { category: "生活", amount: 5880 },
      { category: "居住", amount: 3800 },
    ]);
  });
});
