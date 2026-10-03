// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentFinanceOptions, AgentTransactionDraft } from "./types";
import { confirmAgentTransaction } from "./confirm";

const ids = {
  account: "10000000-0000-4000-8000-000000000001",
  bucketExpense: "20000000-0000-4000-8000-000000000001",
  bucketSaving: "20000000-0000-4000-8000-000000000002",
  expenseCategory: "30000000-0000-4000-8000-000000000001",
  incomeCategory: "30000000-0000-4000-8000-000000000002",
  request: "40000000-0000-4000-8000-000000000001",
  savings: "10000000-0000-4000-8000-000000000002",
};

const options: AgentFinanceOptions = {
  accounts: [
    { accountClass: "asset", currency: "CNY", id: ids.account, name: "微信" },
    { accountClass: "asset", currency: "CNY", id: ids.savings, name: "存钱小荷包" },
  ],
  budgetBuckets: [
    { id: ids.bucketExpense, kind: "expense", name: "变动必要开销" },
    { id: ids.bucketSaving, kind: "saving", name: "储蓄" },
  ],
  expenseCategories: [{ defaultBudgetBucketId: ids.bucketExpense, id: ids.expenseCategory, name: "餐饮" }],
  incomeCategories: [{ id: ids.incomeCategory, name: "工资" }],
};

const expense = (overrides: Partial<AgentTransactionDraft> = {}): AgentTransactionDraft => ({
  accountId: ids.account,
  accountName: "微信",
  amount: 12,
  budgetBucketId: ids.bucketExpense,
  budgetBucketName: "变动必要开销",
  categoryId: ids.expenseCategory,
  categoryName: "餐饮",
  description: "早餐",
  draftId: "50000000-0000-4000-8000-000000000001",
  excludeFromBudget: false,
  fromAccountId: null,
  fromAccountName: null,
  issues: [],
  memo: null,
  occurredAt: "2026-10-03T08:10",
  purpose: null,
  rawText: "微信早餐12",
  requestId: null,
  sourceText: "微信早餐12",
  status: "ready",
  toAccountId: null,
  toAccountName: null,
  type: "expense",
  ...overrides,
});

const createExpense = vi.fn();
const createIncome = vi.fn();
const createTransfer = vi.fn();
const dependencies = { createExpense, createIncome, createTransfer };
const client = {} as never;
const now = new Date("2026-10-03T03:00:00.000Z");

describe("confirmAgentTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createExpense.mockResolvedValue({
      budgetBucketId: ids.bucketExpense,
      budgetExcluded: false,
      budgetImpactCreated: true,
      budgetPeriodId: "60000000-0000-4000-8000-000000000001",
      entryId: "70000000-0000-4000-8000-000000000001",
      lineId: "80000000-0000-4000-8000-000000000001",
      warningCode: null,
    });
    createIncome.mockResolvedValue({ entryId: ids.request, lineId: "line-income", replayed: false });
    createTransfer.mockResolvedValue({
      budget_bucket_id: ids.bucketSaving,
      budget_impact_created: true,
      budget_period_id: "period",
      entry_id: ids.request,
      from_line_id: "from",
      replayed: false,
      to_line_id: "to",
      warning_code: null,
    });
  });

  it("dispatches a revalidated expense with its original source text", async () => {
    await expect(confirmAgentTransaction(client, expense(), options, now, dependencies)).resolves.toMatchObject({
      entryId: "70000000-0000-4000-8000-000000000001",
      status: "success",
    });
    expect(createExpense).toHaveBeenCalledWith(client, {
      accountId: ids.account,
      amount: 12,
      budgetBucketId: ids.bucketExpense,
      categoryId: ids.expenseCategory,
      description: "早餐",
      excludeFromBudget: false,
      memo: null,
      occurredAt: "2026-10-03T00:10:00.000Z",
      rawText: "微信早餐12",
    });
  });

  it("dispatches income with its stable request identity", async () => {
    const draft = expense({
      budgetBucketId: null,
      budgetBucketName: null,
      categoryId: ids.incomeCategory,
      categoryName: "工资",
      description: "工资",
      requestId: ids.request,
      type: "income",
    });
    await expect(confirmAgentTransaction(client, draft, options, now, dependencies)).resolves.toMatchObject({ status: "success" });
    expect(createIncome).toHaveBeenCalledWith(client, expect.objectContaining({
      accountId: ids.account,
      categoryId: ids.incomeCategory,
      requestId: ids.request,
    }));
  });

  it("dispatches transfer with its stable request identity and budget purpose", async () => {
    const draft = expense({
      accountId: null,
      accountName: null,
      budgetBucketId: ids.bucketSaving,
      budgetBucketName: "储蓄",
      categoryId: null,
      categoryName: null,
      description: "转入储蓄",
      fromAccountId: ids.account,
      fromAccountName: "微信",
      purpose: "saving",
      requestId: ids.request,
      toAccountId: ids.savings,
      toAccountName: "存钱小荷包",
      type: "transfer",
    });
    await expect(confirmAgentTransaction(client, draft, options, now, dependencies)).resolves.toMatchObject({ status: "success" });
    expect(createTransfer).toHaveBeenCalledWith(client, expect.objectContaining({
      p_budget_bucket_id: ids.bucketSaving,
      p_from_account_id: ids.account,
      p_request_id: ids.request,
      p_to_account_id: ids.savings,
    }));
  });

  it("rejects a stale account even if the old draft claimed to be ready", async () => {
    const result = await confirmAgentTransaction(client, expense({ accountId: "90000000-0000-4000-8000-000000000001" }), options, now, dependencies);
    expect(result).toMatchObject({ status: "error", message: expect.stringMatching(/账户/) });
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("rejects incomplete drafts and never writes", async () => {
    const result = await confirmAgentTransaction(client, expense({ amount: null, status: "needs_input" }), options, now, dependencies);
    expect(result).toMatchObject({ status: "error", message: expect.stringMatching(/金额/) });
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("returns a successful write warning without changing the transaction fact", async () => {
    createExpense.mockResolvedValueOnce({
      budgetBucketId: ids.bucketExpense,
      budgetExcluded: false,
      budgetImpactCreated: false,
      budgetPeriodId: null,
      entryId: "70000000-0000-4000-8000-000000000001",
      lineId: "80000000-0000-4000-8000-000000000001",
      warningCode: "no_budget_period",
    });
    await expect(confirmAgentTransaction(client, expense(), options, now, dependencies)).resolves.toMatchObject({
      entryId: "70000000-0000-4000-8000-000000000001",
      message: expect.stringMatching(/预算/),
      status: "warning",
    });
  });
});
