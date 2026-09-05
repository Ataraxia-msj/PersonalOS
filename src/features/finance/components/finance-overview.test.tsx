import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FinanceOverviewData } from "../types";
import { FinanceOverview } from "./finance-overview";

const data: FinanceOverviewData = {
  cashflow: [
    { expense: 7200, income: 12800, month: "3月" },
    { expense: 9680, income: 18200, month: "9月" },
  ],
  monthlyExpense: 9680,
  monthlyIncome: 18200,
  netWorth: 160000,
  totalAssets: 200000,
  totalLiabilities: 40000,
  transactions: [{
    accountId: "daily",
    accountName: "日常账户",
    amount: -38,
    budgetLabel: "未归入预算",
    category: "餐饮",
    date: "2026-09-04",
    editable: true,
    excludedFromBudget: false,
    icon: "shopping-bag",
    id: "entry-lunch",
    merchant: "午餐",
  }],
};

describe("FinanceOverview", () => {
  it("renders View-backed totals and recent transactions", () => {
    render(<FinanceOverview data={data} />);

    expect(screen.getByText("净资产")).toBeVisible();
    expect(screen.getByText("¥160,000.00")).toBeVisible();
    expect(screen.getByText("总资产")).toBeVisible();
    expect(screen.getByText("¥200,000.00")).toBeVisible();
    expect(screen.getByText("总负债")).toBeVisible();
    expect(screen.getByText("¥40,000.00")).toBeVisible();
    expect(screen.getByText("¥18,200")).toBeVisible();
    expect(screen.getByText("¥9,680")).toBeVisible();
    expect(screen.getByText("午餐")).toBeVisible();
    expect(screen.getByText("-¥38")).toBeVisible();
    expect(screen.queryByText(/mock/i)).not.toBeInTheDocument();
  });

  it("provides an accessible text summary for the visual trend chart", () => {
    render(<FinanceOverview data={data} />);

    expect(
      screen.getByText("3月至9月收入由 ¥12,800 变化为 ¥18,200，支出由 ¥7,200 变化为 ¥9,680。"),
    ).toBeInTheDocument();
  });
});
