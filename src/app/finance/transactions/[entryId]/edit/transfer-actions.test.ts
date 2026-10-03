// @vitest-environment node

import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAccountBalances, getBudgetBuckets } from "@/lib/finance/queries";
import { updateTransferTransaction } from "@/lib/finance/transfer-mutations";
import { createClient } from "@/lib/supabase/server";

import { updateTransferTransactionAction } from "./transfer-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/finance/queries", () => ({ getAccountBalances: vi.fn(), getBudgetBuckets: vi.fn() }));
vi.mock("@/lib/finance/transfer-mutations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/finance/transfer-mutations")>();
  return { ...actual, updateTransferTransaction: vi.fn() };
});

const ids = [1, 2, 3, 4].map((n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`);
const claims = vi.fn();
const client = { auth: { getClaims: claims } };
function form() {
  const data = new FormData();
  Object.entries({ entryId: ids[0], fromAccountId: ids[1], toAccountId: ids[2], amount: "500",
    occurredAt: "2026-09-07T08:00:00", purpose: "saving", budgetBucketId: ids[3],
    description: "转入储蓄", memo: "备用金" }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("updateTransferTransactionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.mocked(createClient).mockResolvedValue(client as never);
    claims.mockResolvedValue({ data: { claims: { sub: "user" } }, error: null });
    vi.mocked(getAccountBalances).mockResolvedValue([
      { account_id: ids[1], account_name: "银行", account_class: "asset", currency: "CNY", is_active: true },
      { account_id: ids[2], account_name: "储蓄", account_class: "asset", currency: "CNY", is_active: true },
    ] as never);
    vi.mocked(getBudgetBuckets).mockResolvedValue([{ id: ids[3], name: "储蓄", bucket_kind: "saving", is_active: true }] as never);
    vi.mocked(updateTransferTransaction).mockResolvedValue({ entry_id: ids[0], from_line_id: "line-from", to_line_id: "line-to",
      budget_impact_created: true, budget_period_id: "period", budget_bucket_id: ids[3], warning_code: null });
  });

  it("authenticates, validates real options, updates once and refreshes Finance", async () => {
    await expect(updateTransferTransactionAction(form())).resolves.toMatchObject({ status: "success" });
    expect(updateTransferTransaction).toHaveBeenCalledWith(client, {
      p_entry_id: ids[0], p_from_account_id: ids[1], p_to_account_id: ids[2], p_amount: 500,
      p_occurred_at: "2026-09-07T00:00:00.000Z", p_purpose: "saving", p_budget_bucket_id: ids[3],
      p_description: "转入储蓄", p_memo: "备用金",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/finance", "layout");
  });

  it("returns a confirmed warning when a closed budget impact is preserved", async () => {
    vi.mocked(updateTransferTransaction).mockResolvedValueOnce({ entry_id: ids[0], from_line_id: "line-from", to_line_id: "line-to",
      budget_impact_created: true, budget_period_id: "period", budget_bucket_id: ids[3], warning_code: "budget_period_closed_preserved" });
    await expect(updateTransferTransactionAction(form())).resolves.toMatchObject({
      status: "success", message: expect.stringContaining("已关闭预算保持原记录"),
    });
  });

  it("rejects lost auth and invalid real account direction before mutation", async () => {
    claims.mockResolvedValueOnce({ data: null, error: null });
    await expect(updateTransferTransactionAction(form())).resolves.toMatchObject({ status: "error" });
    vi.mocked(getAccountBalances).mockResolvedValueOnce([]);
    await expect(updateTransferTransactionAction(form())).resolves.toMatchObject({ status: "error" });
    expect(updateTransferTransaction).not.toHaveBeenCalled();
  });
});
