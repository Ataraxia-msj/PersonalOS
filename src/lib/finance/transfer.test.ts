import { describe, expect, it, vi } from "vitest";
import { adaptTransactions } from "./adapters";
import { validateTransferInput, validateTransferUpdateInput } from "./transfer-validation";
import type { TransactionDetailView } from "./types";
import { formatTransactionAmount } from "@/features/finance/format";
import { updateTransferTransaction } from "./transfer-mutations";

const ids = [1, 2, 3, 4].map((n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`);
export function transferForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  Object.entries({ requestId: ids[0], fromAccountId: ids[1], toAccountId: ids[2], amount: "123.45",
    occurredAt: "2026-09-07T23:00", purpose: "general", description: "调拨", ...overrides,
  }).forEach(([key, value]) => form.set(key, value));
  return form;
}
describe("transfer input", () => {
  it("normalizes Shanghai time and sends a single canonical RPC payload", () => {
    expect(validateTransferInput(transferForm(), new Date("2026-09-08T00:00Z")).args).toMatchObject({
      p_request_id: ids[0], p_occurred_at: "2026-09-07T15:00:00.000Z", p_amount: 123.45,
      p_purpose: "general", p_budget_bucket_id: null, p_memo: null,
    });
  });
  it.each(["0", "-1", "NaN", "Infinity", "1.001", "1000000000000", "1e3"])("rejects invalid amount %s", (amount) => {
    expect(validateTransferInput(transferForm({ amount })).args).toBeNull();
  });
  it.each(["2026-02-30T10:00", "2999-01-01T00:00", "2026-09-07T25:00", "0000-01-01T00:00"])("rejects invalid date %s", (occurredAt) => {
    expect(validateTransferInput(transferForm({ occurredAt })).args).toBeNull();
  });
  it("rejects same account, invalid UUID/purpose, general budget, and oversized text", () => {
    const cases: Record<string, string>[] = [{ toAccountId: ids[1].toUpperCase() }, { requestId: "bad" }, { purpose: "income" },
      { budgetBucketId: ids[3] }, { description: " " }, { memo: "字".repeat(1001) }];
    for (const overrides of cases) {
      expect(validateTransferInput(transferForm(overrides)).args).toBeNull();
    }
  });
  it("allows contribution without a bucket for explicit warning at save", () => {
    expect(validateTransferInput(transferForm({ purpose: "saving" })).args?.p_budget_bucket_id).toBeNull();
  });
  it("normalizes update identity and validates purpose-specific account and bucket options", () => {
    const form = transferForm({ requestId: ids[3], purpose: "saving", budgetBucketId: ids[3], memo: "储蓄备注" });
    form.set("entryId", ids[0]);
    const result = validateTransferUpdateInput(form, {
      accounts: [
        { id: ids[1], name: "来源", accountClass: "asset", currency: "CNY", balance: 1, institution: null },
        { id: ids[2], name: "目标", accountClass: "asset", currency: "CNY", balance: 2, institution: null },
      ],
      budgetBuckets: [{ id: ids[3], name: "储蓄", kind: "saving" }],
    }, new Date("2026-09-08T00:00Z"));
    expect(result.args).toMatchObject({
      p_entry_id: ids[0], p_from_account_id: ids[1], p_to_account_id: ids[2],
      p_purpose: "saving", p_budget_bucket_id: ids[3], p_memo: "储蓄备注",
    });
    expect(result.args).not.toHaveProperty("p_request_id");
  });
  it("rejects update identity, wrong account direction/currency and incompatible bucket purpose", () => {
    const options = {
      accounts: [
        { id: ids[1], name: "来源", accountClass: "liability" as const, currency: "CNY", balance: 1, institution: null },
        { id: ids[2], name: "目标", accountClass: "asset" as const, currency: "USD", balance: 2, institution: null },
      ],
      budgetBuckets: [{ id: ids[3], name: "投资", kind: "investment" as const }],
    };
    const form = transferForm({ purpose: "saving", budgetBucketId: ids[3] });
    form.set("entryId", "bad");
    const result = validateTransferUpdateInput(form, options, new Date("2026-09-08T00:00Z"));
    expect(result.args).toBeNull();
    expect(result.errors).toEqual(expect.objectContaining({
      budgetBucketId: expect.any(String), entryId: expect.any(String),
      fromAccountId: expect.any(String), toAccountId: expect.any(String),
    }));
  });
});

describe("transfer update mutation", () => {
  it("calls the update RPC with exact names and confirms its single typed result", async () => {
    const args = {
      p_entry_id: ids[0], p_occurred_at: "2026-09-07T15:00:00.000Z", p_description: "调拨",
      p_from_account_id: ids[1], p_to_account_id: ids[2], p_amount: 123.45,
      p_purpose: "saving" as const, p_budget_bucket_id: ids[3], p_memo: "备注",
    };
    const row = { entry_id: ids[0], from_line_id: ids[1], to_line_id: ids[2],
      budget_impact_created: true, budget_period_id: ids[3], budget_bucket_id: ids[3], warning_code: null };
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    await expect(updateTransferTransaction({ rpc } as never, args)).resolves.toEqual(row);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("update_transfer_transaction", args);
  });

  it("propagates update errors and treats malformed success as unconfirmed", async () => {
    const args = { p_entry_id: ids[0], p_occurred_at: "2026-09-07T15:00:00.000Z", p_description: "调拨",
      p_from_account_id: ids[1], p_to_account_id: ids[2], p_amount: 123.45,
      p_purpose: "general" as const, p_budget_bucket_id: null, p_memo: null };
    await expect(updateTransferTransaction({ rpc: vi.fn().mockResolvedValue({ data: null,
      error: { code: "P0001", message: "transfer_entry_not_editable" } }) } as never, args))
      .rejects.toThrow("transfer_entry_not_editable");
    await expect(updateTransferTransaction({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as never, args))
      .rejects.toThrow("Unconfirmed transfer update response");
  });
});

const base: TransactionDetailView = {
  entry_id: ids[0], occurred_at: "2026-09-07T16:30:00Z", entry_type: "transfer", transfer_purpose: "saving",
  description: "储蓄投入", source: "manual", status: "confirmed", related_entry_id: null,
  line_id: "line-out", line_sort_order: 0, amount: -123.45, memo: null,
  account_id: ids[1], account_name: "银行", account_class: "asset", account_type: "bank", institution: null,
  category_id: null, category_name: null, category_type: null, exclude_from_budget: false,
  budget_period_id: "period", budget_period_start_date: "2026-09-01", budget_period_end_date: "2026-09-30",
  budget_bucket_id: ids[3], budget_bucket_name: "真实储蓄分类", saved_budget_bucket_id: ids[3], saved_budget_bucket_name: "真实储蓄分类",
};
function pair(purpose: "general" | "saving" | "investment" | "debt" = "saving"): TransactionDetailView[] {
  return [{ ...base, transfer_purpose: purpose, exclude_from_budget: purpose === "general",
    saved_budget_bucket_id: purpose === "general" ? null : base.saved_budget_bucket_id,
    saved_budget_bucket_name: purpose === "general" ? null : base.saved_budget_bucket_name },
  { ...base, transfer_purpose: purpose, exclude_from_budget: purpose === "general", line_id: "line-in", line_sort_order: 1,
    account_id: ids[2], account_name: "目标账户", account_class: purpose === "debt" ? "liability" : "asset",
    amount: purpose === "debt" ? -123.45 : 123.45, saved_budget_bucket_id: null, saved_budget_bucket_name: null,
    budget_period_id: null, budget_period_start_date: null, budget_period_end_date: null, budget_bucket_id: null, budget_bucket_name: null,
  }];
}
describe("transfer grouping", () => {
  it("formats verified USD without relabeling it CNY and never guesses missing currency", () => {
    const currencies = [ids[1], ids[2]].map((id) => ({ account_id: id, currency: "USD" }));
    const [row] = adaptTransactions(pair(), currencies);
    expect(row.transfer?.currency).toBe("USD");
    expect(formatTransactionAmount(row)).toContain("USD");
    expect(formatTransactionAmount(row)).not.toContain("¥");
    expect(formatTransactionAmount(adaptTransactions(pair())[0])).toContain("币种待确认");
  });
  it("retains legacy per-line facts instead of inventing a combined amount", () => {
    const legacy = pair().map((row) => ({ ...row, transfer_purpose: null, memo: "原始备注" }));
    expect(adaptTransactions(legacy)[0].transfer?.lines).toEqual([
      { id: "line-out", accountName: "银行", amount: -123.45, memo: "原始备注", currency: null },
      { id: "line-in", accountName: "目标账户", amount: 123.45, memo: "原始备注", currency: null },
    ]);
  });
  it.each(["general", "saving", "investment", "debt"] as const)("shows %s once with neutral positive magnitude and both accounts", (purpose) => {
    const [row] = adaptTransactions(pair(purpose).reverse());
    expect(row).toMatchObject({ accountName: "银行 → 目标账户", amount: 123.45, editable: true, entryType: "transfer",
      date: "2026-09-08", transfer: { purpose, legacy: false }, accounts: [{ id: ids[1], name: "银行" }, { id: ids[2], name: "目标账户" }],
    });
    expect(adaptTransactions(pair(purpose))).toHaveLength(1);
  });
  it("preserves budget attribution from the source line", () => {
    expect(adaptTransactions(pair())[0].budgetLabel).toBe("2026年9月 · 真实储蓄分类");
  });
  it("does not guess amounts or direction for legacy or malformed transfer lines", () => {
    const legacy = pair().map((row) => ({ ...row, transfer_purpose: null }));
    for (const rows of [legacy, pair().slice(0, 1), [pair()[0], { ...pair()[1], amount: 111 }]]) {
      expect(adaptTransactions(rows)[0]).toMatchObject({ amount: null, editable: false, transfer: { legacy: true } });
      expect(adaptTransactions(rows)[0].accountName).not.toContain("→");
    }
  });
});
