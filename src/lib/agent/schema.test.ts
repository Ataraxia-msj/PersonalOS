// @vitest-environment node

import { describe, expect, it } from "vitest";

import { parseModelInterpretation } from "./schema";

const expense = {
  accountId: "10000000-0000-4000-8000-000000000001",
  amount: 12,
  budgetBucketId: null,
  categoryId: "20000000-0000-4000-8000-000000000001",
  description: "早餐",
  excludeFromBudget: false,
  fromAccountId: null,
  memo: null,
  occurredAt: "2026-10-03T08:10",
  purpose: null,
  sourceText: "微信早餐12",
  toAccountId: null,
  type: "expense",
} as const;

describe("parseModelInterpretation", () => {
  it("preserves an ordered multi-transaction response", () => {
    const parsed = parseModelInterpretation({
      message: "识别到两笔交易。",
      transactions: [expense, { ...expense, amount: 3, description: "地铁", sourceText: "地铁3块" }],
      unresolvedSegments: [],
    });

    expect(parsed.transactions.map((item) => [item.description, item.amount])).toEqual([
      ["早餐", 12],
      ["地铁", 3],
    ]);
  });

  it.each([
    ["unknown top-level property", { message: "ok", transactions: [], unresolvedSegments: [], extra: true }],
    ["unknown transaction property", { message: "ok", transactions: [{ ...expense, confidence: 0.9 }], unresolvedSegments: [] }],
    ["non-positive amount", { message: "ok", transactions: [{ ...expense, amount: 0 }], unresolvedSegments: [] }],
    ["non-finite amount", { message: "ok", transactions: [{ ...expense, amount: Number.POSITIVE_INFINITY }], unresolvedSegments: [] }],
    ["missing nullable fields", { message: "ok", transactions: [{ type: "expense", amount: 12 }], unresolvedSegments: [] }],
  ])("rejects %s", (_name, value) => {
    expect(() => parseModelInterpretation(value)).toThrow("Invalid Qwen structured response");
  });
});
