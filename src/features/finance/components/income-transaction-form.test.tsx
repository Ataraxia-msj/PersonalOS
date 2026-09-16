import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { IncomeTransactionFormData } from "../types";
import { IncomeTransactionForm, type IncomeTransactionFormAction } from "./income-transaction-form";

const data: IncomeTransactionFormData = {
  accounts: [{
    accountClass: "asset",
    balance: 1175.45,
    currency: "CNY",
    id: "10000000-0000-0000-0000-000000000001",
    institution: "建设银行",
    name: "建设银行",
  }],
  categories: [{ id: "30000000-0000-0000-0000-000000000001", name: "工资" }],
};

describe("IncomeTransactionForm", () => {
  it("renders only real income fields and no budget controls", async () => {
    render(<IncomeTransactionForm action={vi.fn() as IncomeTransactionFormAction}
      data={data} defaultOccurredAt="2026-09-15T09:00:00" />);

    expect(screen.getByRole("heading", { name: "新增收入" })).toBeVisible();
    expect(screen.getByRole("option", { name: /建设银行/ })).toBeVisible();
    expect(screen.getByRole("option", { name: "工资" })).toBeVisible();
    expect(screen.queryByLabelText("预算分类")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "记录收入" })).toBeEnabled());
  });

  it("submits a stable request id and shows the confirmed database result", async () => {
    const user = userEvent.setup();
    const action: IncomeTransactionFormAction = vi.fn().mockResolvedValue({
      errors: {},
      message: "收入已记录，财务数据已刷新。",
      result: { entryId: "entry-salary", lineId: "line-salary", replayed: false },
      status: "success",
    });
    render(<IncomeTransactionForm action={action} data={data}
      defaultOccurredAt="2026-09-15T09:00:00" />);

    await user.type(screen.getByLabelText("金额"), "8500.25");
    await user.type(screen.getByLabelText("描述"), "九月工资");
    await user.click(await screen.findByRole("button", { name: "记录收入" }));

    expect(await screen.findByRole("status")).toHaveTextContent("收入已记录");
    const submitted = vi.mocked(action).mock.calls[0][0];
    expect(String(submitted.get("requestId"))).toMatch(/^[0-9a-f-]{36}$/i);
    expect(submitted.get("amount")).toBe("8500.25");
    expect(submitted.get("categoryId")).toBe("30000000-0000-0000-0000-000000000001");
  });
});
