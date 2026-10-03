import { beforeEach, describe, expect, it, vi } from "vitest";

const d = vi.hoisted(() => ({
  client: vi.fn(), accounts: vi.fn(), buckets: vi.fn(), categories: vi.fn(),
  income: vi.fn(), transfer: vi.fn(), periods: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: d.client }));
vi.mock("./queries", () => ({
  getAccountBalances: d.accounts,
  getBudgetBuckets: d.buckets,
  getIncomeCategories: d.categories,
  getIncomeTransactionForEdit: d.income,
  getTransferTransactionForEdit: d.transfer,
  getBudgetPeriods: d.periods,
}));

import { getIncomeTransactionEditData, getTransferTransactionEditData } from "./service";
import type { TransactionDetailView } from "./types";

const ids = [1, 2, 3, 4].map((n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`);
const line = (overrides: Partial<TransactionDetailView> = {}): TransactionDetailView => ({
  entry_id: ids[0], occurred_at: "2026-09-07T16:30:00Z", entry_type: "income", transfer_purpose: null,
  description: "工资", source: "manual", status: "confirmed", related_entry_id: null,
  line_id: "line-one", line_sort_order: 0, amount: 8500, memo: "税后",
  account_id: ids[1], account_name: "银行卡", account_class: "asset", account_type: "bank", institution: null,
  category_id: ids[3], category_name: "工资", category_type: "income", exclude_from_budget: false,
  budget_period_id: null, budget_period_start_date: null, budget_period_end_date: null,
  budget_bucket_id: null, budget_bucket_name: null, saved_budget_bucket_id: null, saved_budget_bucket_name: null,
  ...overrides,
});
const accounts = [
  { account_id: ids[1], account_name: "银行卡", account_class: "asset", account_type: "bank", currency: "CNY",
    institution: null, include_in_net_worth: true, is_active: true, sort_order: 0, latest_snapshot_at: null,
    latest_snapshot_balance: null, ledger_change_after_snapshot: 0, estimated_balance: 1, balance_source: "ledger_only" },
  { account_id: ids[2], account_name: "储蓄", account_class: "asset", account_type: "bank", currency: "CNY",
    institution: null, include_in_net_worth: true, is_active: true, sort_order: 1, latest_snapshot_at: null,
    latest_snapshot_balance: null, ledger_change_after_snapshot: 0, estimated_balance: 2, balance_source: "ledger_only" },
];

describe("transaction editing services", () => {
  beforeEach(() => {
    vi.resetAllMocks(); d.client.mockResolvedValue({}); d.accounts.mockResolvedValue(accounts);
    d.categories.mockResolvedValue([{ id: ids[3], name: "工资", category_type: "income", is_active: true }]);
    d.buckets.mockResolvedValue([{ id: ids[3], name: "储蓄", bucket_kind: "saving", is_active: true }]);
    d.periods.mockResolvedValue([]);
    d.income.mockResolvedValue({ transactionLines: [line()], budgetImpacts: [] });
    d.transfer.mockResolvedValue({ transactionLines: [
      line({ entry_type: "transfer", transfer_purpose: "saving", category_id: null, category_name: null,
        category_type: null, description: "转入储蓄", amount: -500, memo: "留作备用", saved_budget_bucket_id: ids[3] }),
      line({ entry_type: "transfer", transfer_purpose: "saving", category_id: null, category_name: null,
        category_type: null, description: "转入储蓄", line_id: "line-two", line_sort_order: 1,
        account_id: ids[2], account_name: "储蓄", amount: 500, memo: "留作备用" }),
    ], budgetImpacts: [] });
  });

  it("maps one safe income exactly and shares one client across concurrent option reads", async () => {
    await expect(getIncomeTransactionEditData(ids[0])).resolves.toMatchObject({
      initialValues: { entryId: ids[0], occurredAt: "2026-09-08T00:30", amount: 8500,
        accountId: ids[1], categoryId: ids[3], description: "工资", memo: "税后" },
    });
    expect(d.client).toHaveBeenCalledOnce();
    expect(d.income).toHaveBeenCalledWith({}, ids[0]);
    expect(d.accounts).toHaveBeenCalledWith({});
    expect(d.categories).toHaveBeenCalledWith({});
  });

  it("rejects malformed income rather than guessing edit fields", async () => {
    for (const rows of [[], [line(), line({ line_id: "two" })], [line({ source: "import" })],
      [line({ amount: -1 })], [line({ category_type: "expense" })]]) {
      d.income.mockResolvedValueOnce({ transactionLines: rows, budgetImpacts: [] });
      await expect(getIncomeTransactionEditData(ids[0])).resolves.toBeNull();
    }
  });

  it("maps the exact source, destination, purpose, memo and saved bucket of a safe transfer", async () => {
    await expect(getTransferTransactionEditData(ids[0])).resolves.toMatchObject({
      initialValues: { entryId: ids[0], occurredAt: "2026-09-08T00:30", amount: 500,
        fromAccountId: ids[1], toAccountId: ids[2], purpose: "saving", budgetBucketId: ids[3],
        description: "转入储蓄", memo: "留作备用", budgetLocked: false },
    });
    expect(d.client).toHaveBeenCalledOnce();
    expect(d.transfer).toHaveBeenCalledWith({}, ids[0]);
  });

  it("rejects legacy or malformed transfer structures and locks a closed impact", async () => {
    const valid = await d.transfer();
    for (const rows of [valid.transactionLines.slice(0, 1),
      valid.transactionLines.map((item: TransactionDetailView) => ({ ...item, transfer_purpose: null })),
      [valid.transactionLines[0], { ...valid.transactionLines[1], amount: 499 }]]) {
      d.transfer.mockResolvedValueOnce({ transactionLines: rows, budgetImpacts: [] });
      await expect(getTransferTransactionEditData(ids[0])).resolves.toBeNull();
    }
    d.periods.mockResolvedValueOnce([{ id: "period", status: "closed" }]);
    d.transfer.mockResolvedValueOnce({ transactionLines: valid.transactionLines, budgetImpacts: [{
      id: "impact", entry_id: ids[0], line_id: "line-one", budget_period_id: "period", budget_bucket_id: ids[3],
      amount: 500, source: "manual", note: null, created_at: "", updated_at: "",
    }] });
    await expect(getTransferTransactionEditData(ids[0])).resolves.toMatchObject({ initialValues: { budgetLocked: true } });
  });
});
