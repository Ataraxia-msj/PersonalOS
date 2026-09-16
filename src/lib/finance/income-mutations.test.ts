import { describe, expect, it, vi } from "vitest";

import {
  createIncomeTransaction,
  IncomeMutationError,
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
});
