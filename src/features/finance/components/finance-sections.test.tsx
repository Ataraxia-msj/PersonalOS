import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ManagedAccount } from "@/lib/finance/account-management-types";
import type { FinanceAnalysisPageData, Transaction } from "../types";
import { AccountList } from "./account-list";
import { SpendingAnalysis } from "./spending-analysis";
import { TransactionList } from "./transaction-list";

const accounts: ManagedAccount[] = [
  { accountClass: "asset", accountType: "bank", balanceSource: "snapshot", createdAt: "2026-09-01T00:00:00Z",
    currency: "CNY", estimatedBalance: 21480.2, id: "daily", includeInNetWorth: true, institution: "招商银行",
    isActive: true, latestSnapshotAt: "2026-09-01T00:00:00Z", name: "日常账户", note: null, sortOrder: 0,
    updatedAt: "2026-09-01T00:00:00Z" },
];
const transactions: Transaction[] = [
  { accountId: "daily", accountName: "日常账户", amount: -3800, budgetLabel: "不计入预算", category: "居住", date: "2026-09-02", editable: true, excludedFromBudget: true, icon: "home", id: "rent", merchant: "房租" },
  { accountId: "daily", accountName: "日常账户", amount: 16800, budgetLabel: "未归入预算", category: "收入", date: "2026-09-01", editable: false, excludedFromBudget: false, icon: "briefcase", id: "salary", merchant: "工资" },
];
const emptyAnalysis: FinanceAnalysisPageData = {
  availableMonths: [], budgetSections: [], categories: [], currency: null, insights: [],
  selectedMonth: null, summary: null, trend: [],
};

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

  it("routes editable income and transfer rows to their validated edit modes", () => {
    render(<TransactionList transactions={[
      { ...transactions[1], entryType: "income", editable: true },
      { ...transactions[0], id: "move", merchant: "转入储蓄", entryType: "transfer", editable: true },
    ]} />);
    expect(screen.getByRole("link", { name: "修改工资" })).toHaveAttribute(
      "href", "/finance/transactions/salary/edit?type=income",
    );
    expect(screen.getByRole("link", { name: "修改转入储蓄" })).toHaveAttribute(
      "href", "/finance/transactions/move/edit?type=transfer",
    );
  });

  it("renders the View-backed budget attribution in its own column", () => {
    render(<TransactionList transactions={[
      { ...transactions[0], budgetLabel: "2026年9月 · 自由消费", excludedFromBudget: false },
    ]} />);

    expect(screen.getByRole("columnheader", { name: "预算" })).toBeVisible();
    expect(screen.getByText("2026年9月 · 自由消费")).toBeVisible();
  });

  it("renders account balances", () => {
    render(<AccountList accounts={accounts} />);
    expect(screen.getByText("日常账户")).toBeVisible();
    expect(screen.getByText("¥21,480.20")).toBeVisible();
  });

  it("renders an honest analysis empty state when no monthly summary exists", () => {
    render(<SpendingAnalysis data={emptyAnalysis} />);
    expect(screen.getByText("暂无可分析的月度财务数据")).toBeVisible();
  });
});
