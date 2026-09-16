import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/finance/components/expense-transaction-form", () => ({
  ExpenseTransactionForm: () => <div>EXPENSE_FORM</div>,
}));
vi.mock("@/features/finance/components/transfer-transaction-form", () => ({
  TransferTransactionForm: () => <div>TRANSFER_FORM</div>,
}));
vi.mock("@/features/finance/components/income-transaction-form", () => ({
  IncomeTransactionForm: () => <div>INCOME_FORM</div>,
}));
vi.mock("@/lib/finance/service", () => ({
  getExpenseTransactionFormData: vi.fn().mockResolvedValue({}),
  getIncomeTransactionFormData: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/finance/transfer-service", () => ({
  getTransferFormData: vi.fn().mockResolvedValue({}),
}));
vi.mock("../actions", () => ({ createExpenseTransactionAction: vi.fn() }));
vi.mock("../income-actions", () => ({ createIncomeAction: vi.fn() }));
vi.mock("../transfer-actions", () => ({ createTransferAction: vi.fn() }));

import NewTransactionPage from "./page";

describe("NewTransactionPage", () => {
  it("selects the income flow from the transaction type navigation", async () => {
    render(await NewTransactionPage({ searchParams: Promise.resolve({ type: "income" }) }));

    expect(screen.getByRole("link", { name: "收入" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("INCOME_FORM")).toBeVisible();
    expect(screen.queryByText("EXPENSE_FORM")).not.toBeInTheDocument();
  });
});
