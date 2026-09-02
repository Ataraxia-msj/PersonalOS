import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { financeDataset } from "../data";
import { FinanceOverview } from "./finance-overview";

describe("FinanceOverview", () => {
  it("renders derived summary values and the most recent transactions", () => {
    render(<FinanceOverview data={financeDataset} />);

    expect(screen.getByText("¥128,460.20")).toBeVisible();
    expect(screen.getByText("¥18,200")).toBeVisible();
    expect(screen.getByText("¥9,680")).toBeVisible();
    expect(screen.getByRole("heading", { name: "近期交易" })).toBeVisible();
    expect(screen.getByText("房租")).toBeVisible();
    expect(screen.getByText("工资")).toBeVisible();
    expect(screen.getByRole("link", { name: "查看全部交易" })).toHaveAttribute(
      "href",
      "/finance/transactions",
    );
  });

  it("provides an accessible text summary for the visual trend chart", () => {
    render(<FinanceOverview data={financeDataset} />);

    expect(
      screen.getByText("3月至9月收入由 ¥12,800 变化为 ¥18,200，支出由 ¥7,200 变化为 ¥9,680。"),
    ).toBeInTheDocument();
  });
});
