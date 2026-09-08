import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BudgetFormData } from "../types";
import { initialBudgetActionState } from "@/lib/finance/budget-action-state";
import { BudgetForm } from "./budget-form";

const data: BudgetFormData = {
  defaultMonth: "2026-09", period: null, periods: [],
  buckets: [
    { id: "bucket-one", name: "真实消费分类", kind: "expense", active: true, amount: null },
    { id: "bucket-two", name: "真实储蓄分类", kind: "saving", active: true, amount: null },
  ],
};

describe("BudgetForm", () => {
  it("saves real bucket amounts including zero in one action, without a draft or preview step", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ...initialBudgetActionState, status: "success", message: "预算已保存" });
    render(<BudgetForm data={data} action={action} />);
    expect(screen.getByRole("heading", { name: "消费预算" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "资金安排" })).toBeVisible();
    await user.type(screen.getByLabelText("计划收入"), "2000");
    await user.type(screen.getByLabelText("真实消费分类"), "500.25");
    await user.type(screen.getByLabelText("真实储蓄分类"), "0");
    await user.click(screen.getByRole("button", { name: "保存预算" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const submitted = action.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(submitted)).toMatchObject({ month: "2026-09", plannedIncome: "2000", "allocation:bucket-one": "500.25", "allocation:bucket-two": "0" });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存预算" })).toBeDisabled();
  });

  it("opens an existing month instead of allowing duplicate creation", () => {
    render(<BudgetForm data={{ ...data, periods: [{ id: "existing", startDate: "2026-09-01", endDate: "2026-09-30" }] }} action={vi.fn()} />);
    expect(screen.getByRole("link", { name: "打开已有预算" })).toHaveAttribute("href", "/finance/budget/existing/edit");
    expect(screen.getByRole("button", { name: "保存预算" })).toBeDisabled();
  });

  it("keeps closed periods read-only", () => {
    render(<BudgetForm data={{ ...data, period: { id: "closed", month: "2026-09", income: 2000, updatedAt: "2026-09-08T00:00:00Z", status: "closed", currency: "CNY" } }} action={vi.fn()} />);
    expect(screen.getByLabelText("月份")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("计划收入")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("真实消费分类")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "保存预算" })).not.toBeInTheDocument();
  });

  it("submits the original version and preserves inactive allocations when adjusting", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue(initialBudgetActionState);
    render(<BudgetForm data={{ ...data,
      period: { id: "existing", month: "2026-09", income: 2000, updatedAt: "2026-09-08T00:00:00.123456Z", status: "active", currency: "CNY" },
      buckets: data.buckets.map((bucket) => ({ ...bucket, amount: 0, active: bucket.id !== "bucket-two" })),
    }} action={action} />);
    expect(screen.getByLabelText("真实储蓄分类")).toHaveAttribute("readonly");
    await user.click(screen.getByRole("button", { name: "保存预算" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(Object.fromEntries(action.mock.calls[0][1] as FormData)).toMatchObject({
      periodId: "existing", version: "2026-09-08T00:00:00.123456Z", "allocation:bucket-two": "0",
    });
  });
});
