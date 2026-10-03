import { describe, expect, it, vi } from "vitest";

import {
  createIncomeTransaction,
  IncomeMutationError,
  updateIncomeTransaction,
  type IncomeMutationClient,
} from "./income-mutations";

const input = {
  accountId: "10000000-0000-0000-0000-000000000001",
  amount: 8500,
  categoryId: "30000000-0000-0000-0000-000000000001",
  description: "九月工资",
  memo: null,
  occurredAt: "2026-09-15T09:00:00+08:00",
  rawText: null,
  requestId: "90000000-0000-0000-0000-000000000001",
};

describe("income mutations", () => {
  it("calls the income RPC once with exact parameter names", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        entry_id: "90000000-0000-0000-0000-000000000001",
        line_id: "line-salary",
        replayed: false,
      }],
      error: null,
    });
    const client = { rpc } as unknown as IncomeMutationClient;

    await expect(createIncomeTransaction(client, input)).resolves.toEqual({
      entryId: "90000000-0000-0000-0000-000000000001",
      lineId: "line-salary",
      replayed: false,
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("create_income_transaction", {
      p_account_id: input.accountId,
      p_amount: input.amount,
      p_category_id: input.categoryId,
      p_description: input.description,
      p_memo: null,
      p_occurred_at: input.occurredAt,
      p_raw_text: null,
      p_request_id: input.requestId,
    });
  });

  it("surfaces database errors and rejects an empty RPC result", async () => {
    const failed = { rpc: vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "invalid_income_amount" },
    }) } as unknown as IncomeMutationClient;
    await expect(createIncomeTransaction(failed, input)).rejects.toEqual(
      new IncomeMutationError("invalid_income_amount", "22023"),
    );

    const empty = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as unknown as IncomeMutationClient;
    await expect(createIncomeTransaction(empty, input)).rejects.toThrow(
      "create_income_transaction returned no result",
    );
  });

  it("calls the income update RPC with the immutable entry id and exact editable fields", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ entry_id: input.requestId, line_id: "line-salary" }],
      error: null,
    });
    const client = { rpc } as unknown as IncomeMutationClient;

    await expect(updateIncomeTransaction(client, {
      accountId: input.accountId,
      amount: input.amount,
      categoryId: input.categoryId,
      description: input.description,
      entryId: input.requestId,
      memo: "税后工资",
      occurredAt: input.occurredAt,
      rawText: null,
    })).resolves.toEqual({ entryId: input.requestId, lineId: "line-salary" });

    expect(rpc).toHaveBeenCalledExactlyOnceWith("update_income_transaction", {
      p_account_id: input.accountId,
      p_amount: input.amount,
      p_category_id: input.categoryId,
      p_description: input.description,
      p_entry_id: input.requestId,
      p_memo: "税后工资",
      p_occurred_at: input.occurredAt,
      p_raw_text: null,
    });
  });

  it("propagates income update database errors and rejects an empty result", async () => {
    const updateInput = {
      accountId: input.accountId, amount: input.amount, categoryId: input.categoryId,
      description: input.description, entryId: input.requestId, memo: null,
      occurredAt: input.occurredAt, rawText: null,
    };
    const failed = { rpc: vi.fn().mockResolvedValue({ data: null,
      error: { code: "P0001", message: "income_entry_not_editable" } }) } as unknown as IncomeMutationClient;
    await expect(updateIncomeTransaction(failed, updateInput)).rejects.toEqual(
      new IncomeMutationError("income_entry_not_editable", "P0001"),
    );
    const empty = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as unknown as IncomeMutationClient;
    await expect(updateIncomeTransaction(empty, updateInput)).rejects.toThrow(
      "update_income_transaction returned no result",
    );
  });
});
