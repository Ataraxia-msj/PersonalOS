import { describe, expect, it } from "vitest";

import {
  ACCOUNT_TYPES_BY_CLASS,
  validateCreateAccount,
  validateSetAccountActive,
  validateUpdateAccount,
} from "./account-management-validation";

const requestId = "A1000000-0000-0000-0000-000000000001";
const accountId = "A2000000-0000-0000-0000-000000000001";

function validCreate() {
  const data = new FormData();
  Object.entries({
    requestId,
    name: "  日常账户  ",
    accountClass: "asset",
    accountType: "bank",
    currency: "CNY",
    institution: "  建设银行 ",
    sortOrder: "2",
    note: "  工资卡 ",
    initialBalance: "123.45",
    balanceAt: "2026-10-02T09:30",
  }).forEach(([key, value]) => data.set(key, value));
  data.set("includeInNetWorth", "on");
  return data;
}

describe("account management validation", () => {
  it("exports the exact account class/type matrix", () => {
    expect(ACCOUNT_TYPES_BY_CLASS.asset).toContain("money_market");
    expect(ACCOUNT_TYPES_BY_CLASS.asset).not.toContain("loan");
    expect(ACCOUNT_TYPES_BY_CLASS.liability).toEqual([
      "credit_card", "consumer_credit", "loan", "payable", "other",
    ]);
  });

  it("normalizes create input and converts Shanghai local time to an instant", () => {
    expect(validateCreateAccount(validCreate(), new Date("2026-10-02T10:00:00+08:00"))).toEqual({
      errors: {},
      input: {
        accountClass: "asset",
        accountType: "bank",
        balanceAt: "2026-10-02T01:30:00.000Z",
        currency: "CNY",
        includeInNetWorth: true,
        initialBalance: 123.45,
        institution: "建设银行",
        name: "日常账户",
        note: "工资卡",
        requestId: requestId.toLowerCase(),
        sortOrder: 2,
      },
    });
  });

  it("accepts zero and liability balances but rejects bad amounts, types, currency, sort, and future time", () => {
    const liability = validCreate();
    liability.set("accountClass", "liability");
    liability.set("accountType", "loan");
    liability.set("initialBalance", "0");
    expect(validateCreateAccount(liability, new Date("2026-10-02T10:00:00+08:00")).input)
      .toMatchObject({ accountClass: "liability", accountType: "loan", initialBalance: 0 });

    for (const [field, value] of [
      ["initialBalance", "1.001"], ["initialBalance", "-1"],
      ["initialBalance", "1000000000000"], ["currency", "cny"],
      ["sortOrder", "1.5"], ["accountType", "loan"],
      ["balanceAt", "2026-10-02T11:00"],
    ]) {
      const data = validCreate(); data.set(field, value);
      const result = validateCreateAccount(data, new Date("2026-10-02T10:00:00+08:00"));
      expect(result.input, `${field}=${value}`).toBeNull();
      expect(result.errors[field], `${field}=${value}`).toBeDefined();
    }
  });

  it("normalizes update and activation concurrency fields", () => {
    const update = validCreate();
    update.set("accountId", accountId);
    update.set("expectedUpdatedAt", "2026-10-01T00:00:00.000Z");
    expect(validateUpdateAccount(update).input).toMatchObject({
      accountId: accountId.toLowerCase(),
      expectedUpdatedAt: "2026-10-01T00:00:00.000Z",
      name: "日常账户",
    });

    const active = new FormData();
    active.set("accountId", accountId);
    active.set("expectedUpdatedAt", "2026-10-01T00:00:00.000Z");
    active.set("isActive", "false");
    expect(validateSetAccountActive(active)).toEqual({ errors: {}, input: {
      accountId: accountId.toLowerCase(), expectedUpdatedAt: "2026-10-01T00:00:00.000Z", isActive: false,
    } });
  });
});
