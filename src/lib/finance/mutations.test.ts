import { describe, expect, it, vi } from "vitest";

import {
  createExpenseTransaction,
  FinanceMutationError,
  type FinanceMutationClient,
  updateExpenseTransaction,
} from "./mutations";

const input = {
  accountId: "account-daily",
  amount: 18.5,
  budgetBucketId: "bucket-food",
  categoryId: "category-meal",
  description: "午餐",
  excludeFromBudget: false,
  memo: null,
  occurredAt: "2026-09-04T12:30:00+08:00",
  rawText: null,
};

describe("Finance mutations", () => {
  it("calls the expense RPC once with the exact database parameter names", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        budget_bucket_id: "bucket-food",
        budget_impact_created: true,
        budget_excluded: false,
        budget_period_id: "period-september",
        entry_id: "entry-lunch",
        line_id: "line-lunch",
        warning_code: null,
      }],
      error: null,
    });

    await expect(createExpenseTransaction({ rpc } as unknown as FinanceMutationClient, input))
      .resolves.toEqual({
        budgetBucketId: "bucket-food",
        budgetImpactCreated: true,
        budgetExcluded: false,
        budgetPeriodId: "period-september",
        entryId: "entry-lunch",
        lineId: "line-lunch",
        warningCode: null,
      });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("create_expense_transaction", {
      p_account_id: "account-daily",
      p_amount: 18.5,
      p_budget_bucket_id: "bucket-food",
      p_category_id: "category-meal",
      p_description: "午餐",
      p_exclude_from_budget: false,
      p_memo: null,
      p_occurred_at: "2026-09-04T12:30:00+08:00",
      p_raw_text: null,
    });
  });

  it("preserves an explicit budget warning returned by PostgreSQL", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        budget_bucket_id: null,
        budget_impact_created: false,
        budget_excluded: false,
        budget_period_id: null,
        entry_id: "entry-unbudgeted",
        line_id: "line-unbudgeted",
        warning_code: "no_budget_period",
      }],
      error: null,
    });

    const result = await createExpenseTransaction(
      { rpc } as unknown as FinanceMutationClient,
      { ...input, budgetBucketId: null },
    );

    expect(result.warningCode).toBe("no_budget_period");
    expect(result.budgetImpactCreated).toBe(false);
  });

  it("updates an expense through one RPC with exact database parameter names", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        budget_bucket_id: null,
        budget_excluded: true,
        budget_impact_created: false,
        budget_period_id: "period-september",
        entry_id: "entry-lunch",
        line_id: "line-lunch",
        warning_code: null,
      }],
      error: null,
    });

    await expect(updateExpenseTransaction(
      { rpc } as unknown as FinanceMutationClient,
      { ...input, entryId: "entry-lunch", excludeFromBudget: true },
    )).resolves.toMatchObject({
      budgetExcluded: true,
      entryId: "entry-lunch",
    });

    expect(rpc).toHaveBeenCalledWith("update_expense_transaction", {
      p_account_id: "account-daily",
      p_amount: 18.5,
      p_budget_bucket_id: "bucket-food",
      p_category_id: "category-meal",
      p_description: "午餐",
      p_entry_id: "entry-lunch",
      p_exclude_from_budget: true,
      p_memo: null,
      p_occurred_at: "2026-09-04T12:30:00+08:00",
      p_raw_text: null,
    });
  });

  it("throws a contextual mutation error instead of reporting success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "budget_bucket_not_allocated_to_period" },
    });

    await expect(createExpenseTransaction(
      { rpc } as unknown as FinanceMutationClient,
      input,
    )).rejects.toEqual(new FinanceMutationError(
      "budget_bucket_not_allocated_to_period",
      "P0001",
    ));
  });
});
