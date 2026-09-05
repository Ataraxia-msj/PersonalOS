import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BudgetMonth } from "@/features/finance/types";
import { getBudgetPageData } from "@/lib/finance/service";

import BudgetPage from "./page";

vi.mock("@/lib/finance/service", () => ({ getBudgetPageData: vi.fn() }));

const category = (id: string, name: string, executionRate: number) => ({
  category: name,
  changeFromPrevious: 200,
  color: "terracotta" as const,
  executionRate,
  id,
  limit: 1000,
  remaining: 400,
  spent: 600,
  trend: [400, 600],
});

const months: BudgetMonth[] = [
  {
    actualTotal: 3600,
    editable: true,
    executionRate: null,
    id: "period-2026-09",
    label: "2026年9月",
    plannedTotal: 6000,
    remainingTotal: 2400,
    sections: [
      {
        id: "spending",
        title: "消费预算",
        categories: [
          {
            ...category("fixed", "固定必要开销", 0.45),
            limit: 1100,
            remaining: 1095,
            spent: 5,
          },
          category("variable", "变动必要开销", 60),
          category("free", "自由消费", 60),
        ],
      },
      {
        id: "allocation",
        title: "资金安排",
        categories: [
          category("saving", "储蓄", 60),
          category("investment", "投资", 60),
          category("debt", "还款", 60),
        ],
      },
    ],
  },
  {
    actualTotal: 3000,
    editable: false,
    executionRate: null,
    id: "period-2026-08",
    label: "2026年8月",
    plannedTotal: 6000,
    remainingTotal: 3000,
    sections: [
      { id: "spending", title: "消费预算", categories: [] },
      { id: "allocation", title: "资金安排", categories: [] },
    ],
  },
];

describe("BudgetPage", () => {
  beforeEach(() => vi.mocked(getBudgetPageData).mockResolvedValue(months));

  it("renders six real budget buckets in two sections and no invented overall rate", async () => {
    render(await BudgetPage());

    expect(screen.getByRole("heading", { name: "消费预算" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "资金安排" })).toBeVisible();
    for (const name of ["固定必要开销", "变动必要开销", "自由消费", "储蓄", "投资", "还款"]) {
      expect(screen.getByText(name)).toBeVisible();
    }
    expect(screen.getByTestId("overall-execution-rate")).toHaveTextContent("—");
  });

  it("switches a previous month into a read-only budget view", async () => {
    const user = userEvent.setup();
    render(await BudgetPage());

    await user.click(screen.getByRole("button", { name: /2026年8月/ }));

    expect(screen.getByRole("heading", { name: "2026年8月预算" })).toBeVisible();
    expect(screen.getAllByText("只读").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "调整预算" })).not.toBeInTheDocument();
  });

  it("treats the View execution rate as an already-scaled percentage", async () => {
    render(await BudgetPage());

    expect(screen.getByText("0.45%")).toBeVisible();
    expect(screen.getByRole("progressbar", {
      name: "固定必要开销预算执行率 0.45%",
    })).toHaveAttribute("aria-valuenow", "0.45");
  });
});
