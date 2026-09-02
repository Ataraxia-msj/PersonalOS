import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { financeDataset } from "../data";
import { getSpendingByCategory } from "../selectors";
import { AccountList } from "./account-list";
import { BudgetList } from "./budget-list";
import { SpendingAnalysis } from "./spending-analysis";
import { TransactionList } from "./transaction-list";

describe("Finance supporting sections", () => {
  it("filters transaction rows by merchant text", async () => {
    const user = userEvent.setup();
    render(
      <TransactionList accounts={financeDataset.accounts} transactions={financeDataset.transactions} />,
    );

    await user.type(screen.getByRole("searchbox", { name: "搜索交易" }), "房租");

    expect(screen.getByText("房租")).toBeVisible();
    expect(screen.queryByText("工资")).not.toBeInTheDocument();
  });

  it("renders budget utilization from typed budget data", () => {
    render(<BudgetList budgets={financeDataset.budgets} />);

    expect(screen.getByText("居住")).toBeVisible();
    expect(screen.getByText("84%")).toBeVisible();
  });

  it("renders account balances and derived spending analysis", () => {
    const { rerender } = render(<AccountList accounts={financeDataset.accounts} />);
    expect(screen.getByText("日常账户")).toBeVisible();
    expect(screen.getByText("¥21,480.20")).toBeVisible();

    rerender(<SpendingAnalysis spending={getSpendingByCategory(financeDataset)} />);
    expect(screen.getByText("居住")).toBeVisible();
    expect(screen.getByText("¥3,800")).toBeVisible();
  });
});
