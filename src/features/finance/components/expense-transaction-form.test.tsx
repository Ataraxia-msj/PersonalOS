import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ExpenseTransactionFormData, ExpenseTransactionInitialValues } from "../types";
import {
  ExpenseTransactionForm,
  type ExpenseTransactionFormAction,
} from "./expense-transaction-form";

const data: ExpenseTransactionFormData = {
  accounts: [{
    accountClass: "asset",
    balance: 1288,
    currency: "CNY",
    id: "10000000-0000-0000-0000-000000000001",
    institution: "招商银行",
    name: "日常账户",
  }],
  budgetPeriods: [{
    buckets: [
      { id: "bucket-fixed", kind: "expense", name: "固定必要开销" },
      { id: "bucket-free", kind: "expense", name: "自由消费" },
    ],
    endDate: "2026-09-30",
    id: "period-september",
    startDate: "2026-09-01",
    status: "active",
  }],
  categories: [{
    defaultBudgetBucketId: "bucket-fixed",
    id: "30000000-0000-0000-0000-000000000001",
    name: "餐饮",
  }],
};

const initialValues: ExpenseTransactionInitialValues = {
  accountId: "10000000-0000-0000-0000-000000000001",
  amount: 128.5,
  budgetBucketId: "bucket-free",
  budgetLocked: false,
  categoryId: "30000000-0000-0000-0000-000000000001",
  description: "论文投稿费",
  entryId: "entry-paper",
  excludeFromBudget: true,
  occurredAt: "2026-09-03T09:15",
};

describe("ExpenseTransactionForm", () => {
  it("renders only real account, category, and matching budget options", () => {
    render(
      <ExpenseTransactionForm
        action={vi.fn() as ExpenseTransactionFormAction}
        data={data}
        defaultOccurredAt="2026-09-04T12:30"
      />,
    );

    expect(screen.getByRole("heading", { name: "新增支出" })).toBeVisible();
    expect(screen.getByLabelText("日期 / 时间")).toHaveValue("2026-09-04T12:30");
    expect(screen.getByRole("option", { name: /日常账户/ })).toBeVisible();
    expect(screen.getByRole("option", { name: "餐饮" })).toBeVisible();
    expect(screen.getByRole("option", { name: "固定必要开销" })).toBeVisible();
    expect(screen.getByRole("option", { name: "自由消费" })).toBeVisible();
  });

  it("explains that a date without a period will be recorded without budget impact", async () => {
    const user = userEvent.setup();
    render(
      <ExpenseTransactionForm
        action={vi.fn() as ExpenseTransactionFormAction}
        data={data}
        defaultOccurredAt="2026-09-04T12:30"
      />,
    );

    const occurredAt = screen.getByLabelText("日期 / 时间");
    await user.clear(occurredAt);
    await user.type(occurredAt, "2026-10-04T12:30");

    expect(screen.getByText("该日期没有预算月份；交易仍会记账，但不会计入预算。")).toBeVisible();
    expect(screen.getByLabelText("预算分类")).toBeDisabled();
  });

  it("lets the user explicitly exclude a real expense from budget execution", async () => {
    const user = userEvent.setup();
    render(
      <ExpenseTransactionForm
        action={vi.fn() as ExpenseTransactionFormAction}
        data={data}
        defaultOccurredAt="2026-09-04T12:30"
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "不计入预算" }));

    expect(screen.getByLabelText("预算分类")).toBeDisabled();
    expect(screen.getByText("仍计入本月支出并影响账户余额和净资产，但不占用预算。")).toBeVisible();
  });

  it("shows the server warning after a successful unbudgeted transaction", async () => {
    const user = userEvent.setup();
    const action: ExpenseTransactionFormAction = vi.fn().mockResolvedValue({
      entryId: "entry-unbudgeted",
      fieldErrors: {},
      message: "交易已记录，但该日期没有对应预算月份。",
      status: "warning",
    });
    render(
      <ExpenseTransactionForm
        action={action}
        data={data}
        defaultOccurredAt="2026-09-04T12:30"
      />,
    );

    await user.type(screen.getByLabelText("金额"), "18.50");
    await user.type(screen.getByLabelText("描述"), "午餐");
    await user.click(screen.getByRole("button", { name: "记录支出" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "交易已记录，但该日期没有对应预算月份。",
    );
  });

  it("prefills every editable field and submits an entry id in edit mode", () => {
    render(
      <ExpenseTransactionForm
        action={vi.fn() as ExpenseTransactionFormAction}
        data={data}
        initialValues={initialValues}
        mode="edit"
      />,
    );

    expect(screen.getByRole("heading", { name: "修改支出" })).toBeVisible();
    expect(screen.getByLabelText("日期 / 时间")).toHaveValue("2026-09-03T09:15");
    expect(screen.getByLabelText("金额")).toHaveValue(128.5);
    expect(screen.getByLabelText("账户")).toHaveValue(initialValues.accountId);
    expect(screen.getByLabelText("分类")).toHaveValue(initialValues.categoryId);
    expect(screen.getByRole("checkbox", { name: "不计入预算" })).toBeChecked();
    expect(screen.getByLabelText("描述")).toHaveValue("论文投稿费");
    expect(document.querySelector('input[name="entryId"]')).toHaveValue("entry-paper");
    expect(screen.getByRole("button", { name: "保存修改" })).toBeVisible();
  });

  it("locks budget controls when editing a transaction with a closed budget impact", () => {
    render(
      <ExpenseTransactionForm
        action={vi.fn() as ExpenseTransactionFormAction}
        data={data}
        initialValues={{ ...initialValues, budgetLocked: true, excludeFromBudget: false }}
        mode="edit"
      />,
    );

    expect(screen.getByRole("checkbox", { name: "不计入预算" })).toBeDisabled();
    expect(screen.getByLabelText("预算分类")).toBeDisabled();
    expect(screen.getByText("该月份预算已关闭；可以修改交易事实，但原预算记录保持不变。")).toBeVisible();
  });
});
