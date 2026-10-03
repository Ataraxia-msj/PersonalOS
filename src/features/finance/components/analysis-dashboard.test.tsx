import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FinanceAnalysisPageData } from "../types";
import { SpendingAnalysis } from "./spending-analysis";

const comparison = (rate: number | null, tone: "favorable" | "adverse" | "neutral" = "neutral") => ({
  amount: rate, rate, tone,
});

const data: FinanceAnalysisPageData = {
  availableMonths: [{ label: "2026年9月", value: "2026-09" }],
  budgetSections: [
    { id: "spending", title: "消费预算", categories: [
      { id: "fixed", category: "固定必要开销", limit: 1000, spent: 900, color: "terracotta", trend: [], remaining: 100, executionRate: 90, changeFromPrevious: null },
      { id: "variable", category: "变动必要开销", limit: 1000, spent: 500, color: "sand", trend: [], remaining: 500, executionRate: 50, changeFromPrevious: null },
      { id: "free", category: "自由消费", limit: 500, spent: 600, color: "rose", trend: [], remaining: -100, executionRate: 120, changeFromPrevious: null },
    ] },
    { id: "allocation", title: "资金安排", categories: [
      { id: "saving", category: "储蓄", limit: 2000, spent: 1800, color: "terracotta", trend: [], remaining: 200, executionRate: 90, changeFromPrevious: null },
      { id: "invest", category: "投资", limit: 1000, spent: 900, color: "sand", trend: [], remaining: 100, executionRate: 90, changeFromPrevious: null },
      { id: "debt", category: "还款", limit: 300, spent: 200, color: "slate", trend: [], remaining: 100, executionRate: 66.67, changeFromPrevious: null },
    ] },
  ],
  categories: [{ id: "food", name: "餐饮", amount: 1200, transactionCount: 8, share: 28.57, rank: 1 }],
  currency: "CNY",
  insights: [{ id: "budget:free:over", type: "budget_overrun", severity: "warning", title: "自由消费已超预算", message: "已执行 120%，超出 100。", metric: 120, threshold: 100 }],
  selectedMonth: "2026-09",
  summary: {
    income: { value: 12000, mom: comparison(9.09, "favorable"), yoy: comparison(null) },
    expense: { value: 4200, mom: comparison(5, "adverse"), yoy: comparison(null) },
    balance: { value: 7800, mom: comparison(4, "favorable"), yoy: comparison(null) },
    savingRate: 15, savingRateMom: 3, executionRate: 87.67, executionRateMom: 7.67,
    netWorth: 180000, netWorthChange: 3000,
  },
  trend: [{ month: "2026-09-01", label: "2026年9月", income: 12000, expense: 4200, balance: 7800 }],
};

describe("Finance analysis dashboard", () => {
  it("renders real summary comparisons, trend, six buckets, categories and explainable insights", () => {
    render(<SpendingAnalysis data={data} />);
    expect(screen.getByRole("heading", { name: "财务分析" })).toBeVisible();
    expect(screen.getByText("¥12,000")).toBeVisible();
    expect(screen.getAllByText("同比 —").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: /近 12 个月收入、支出与结余趋势/ })).toBeVisible();
    for (const name of ["固定必要开销", "变动必要开销", "自由消费", "储蓄", "投资", "还款"]) {
      expect(screen.getByText(name)).toBeVisible();
    }
    expect(screen.getByText("餐饮")).toBeVisible();
    expect(screen.getByText("自由消费已超预算")).toBeVisible();
    expect(screen.getByText("已执行 120%，超出 100。")).toBeVisible();
  });

  it("renders a genuine empty state without placeholder numbers", () => {
    render(<SpendingAnalysis data={{ ...data, selectedMonth: null, summary: null, trend: [], categories: [], insights: [], budgetSections: [] }} />);
    expect(screen.getByText("暂无可分析的月度财务数据")).toBeVisible();
    expect(screen.queryByText("¥12,000")).not.toBeInTheDocument();
  });
});
