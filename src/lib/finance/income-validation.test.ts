import { describe, expect, it } from "vitest";

import { validateIncomeInput } from "./income-validation";

function validFormData() {
  const data = new FormData();
  data.set("requestId", "90000000-0000-0000-0000-000000000001");
  data.set("occurredAt", "2026-09-15T09:00:00");
  data.set("amount", "8500.25");
  data.set("accountId", "10000000-0000-0000-0000-000000000001");
  data.set("categoryId", "30000000-0000-0000-0000-000000000001");
  data.set("description", "九月工资");
  return data;
}

describe("validateIncomeInput", () => {
  it("normalizes a valid Shanghai income form into exact RPC input", () => {
    expect(validateIncomeInput(validFormData(), new Date("2026-09-15T10:00:00+08:00"))).toEqual({
      errors: {},
      input: {
        accountId: "10000000-0000-0000-0000-000000000001",
        amount: 8500.25,
        categoryId: "30000000-0000-0000-0000-000000000001",
        description: "九月工资",
        memo: null,
        occurredAt: "2026-09-15T01:00:00.000Z",
        rawText: null,
        requestId: "90000000-0000-0000-0000-000000000001",
      },
    });
  });

  it("rejects invalid identifiers, amount, future time, and empty description", () => {
    const data = validFormData();
    data.set("requestId", "bad");
    data.set("accountId", "bad");
    data.set("categoryId", "bad");
    data.set("amount", "0.001");
    data.set("occurredAt", "2026-09-15T11:00:00");
    data.set("description", " ");

    const result = validateIncomeInput(data, new Date("2026-09-15T10:00:00+08:00"));
    expect(result.input).toBeNull();
    expect(result.errors).toEqual(expect.objectContaining({
      accountId: expect.any(String),
      amount: expect.any(String),
      categoryId: expect.any(String),
      description: expect.any(String),
      occurredAt: expect.any(String),
      requestId: expect.any(String),
    }));
  });
});
