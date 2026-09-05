import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Account, Transaction } from "../types";
import { AccountList } from "./account-list";
import { SpendingAnalysis } from "./spending-analysis";
import { TransactionList } from "./transaction-list";

const accounts: Account[] = [
  { balance: 21480.2, id: "daily", institution: "招商银行", name: "日常账户", type: "cash" },
];
const transactions: Transaction[] = [
  { accountId: "daily", accountName: "日常账户", amount: -3800, budgetLabel: "不计入预算", category: "居住", date: "2026-09-02", editable: true, excludedFromBudget: true, icon: "home", id: "rent", merchant: "房租" },
  { accountId: "daily", accountName: "日常账户", amount: 16800, budgetLabel: "未归入预算", category: "收入", date: "2026-09-01", editable: false, excludedFromBudget: false, icon: "briefcase", id: "salary", merchant: "工资" },
];

describe("Finance supporting sections", () => {
  it("filters transaction rows by merchant text", async () => {
    const user = userEvent.setup();
    render(<TransactionList transactions={transactions} />);

    await user.type(screen.getByRole("searchbox", { name: "搜索交易" }), "房租");

    expect(screen.getByText("房租")).toBeVisible();
    expect(screen.queryByText("工资")).not.toBeInTheDocument();
  });

  it("renders a real empty state when no transaction View exists", () => {
    render(<TransactionList transactions={[]} />);
    expect(screen.getByText("暂无真实交易数据")).toBeVisible();
    expect(screen.queryByText(/mock/i)).not.toBeInTheDocument();
  });

  it("labels budget-excluded expenses and exposes edit only for editable transactions", () => {
    render(<TransactionList transactions={transactions} />);

    expect(screen.getByText("不计入预算")).toBeVisible();
    expect(screen.getByRole("link", { name: "修改房租" })).toHaveAttribute(
      "href",
      "/finance/transactions/rent/edit",
    );
    expect(screen.queryByRole("link", { name: "修改工资" })).not.toBeInTheDocument();
  });

  it("renders the View-backed budget attribution in its own column", () => {
    render(<TransactionList transactions={[
      { ...transactions[0], budgetLabel: "2026年9月 · 自由消费", excludedFromBudget: false },
    ]} />);

    expect(screen.getByRole("columnheader", { name: "预算" })).toBeVisible();
    expect(screen.getByText("2026年9月 · 自由消费")).toBeVisible();
  });

  it("renders account balances and View-backed monthly analysis", () => {
    const { rerender } = render(<AccountList accounts={accounts} />);
    expect(screen.getByText("日常账户")).toBeVisible();
    expect(screen.getByText("¥21,480.20")).toBeVisible();

    rerender(<SpendingAnalysis spending={[
      { amount: 3500, category: "支出" },
      { amount: 1800, category: "储蓄" },
      { amount: 900, category: "投资" },
      { amount: 200, category: "还款" },
    ]} />);
    expect(screen.getByRole("heading", { name: "月度资金分析" })).toBeVisible();
    expect(screen.getByText("支出")).toBeVisible();
    expect(screen.getByText("储蓄")).toBeVisible();
    expect(screen.getByText("¥3,500")).toBeVisible();
    expect(screen.queryByText("Agent 观察")).not.toBeInTheDocument();
    expect(screen.queryByText(/mock/i)).not.toBeInTheDocument();
  });

  it("renders an honest analysis empty state when no monthly summary exists", () => {
    render(<SpendingAnalysis spending={[]} />);
    expect(screen.getByText("暂无月度汇总数据")).toBeVisible();
  });
});
