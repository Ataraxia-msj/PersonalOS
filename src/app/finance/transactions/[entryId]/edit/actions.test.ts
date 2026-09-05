// @vitest-environment node

import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initialExpenseTransactionActionState } from "@/lib/finance/action-state";
import { FinanceMutationError, updateExpenseTransaction } from "@/lib/finance/mutations";
import { createClient } from "@/lib/supabase/server";

import { updateExpenseTransactionAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/finance/mutations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/finance/mutations")>();
  return { ...actual, updateExpenseTransaction: vi.fn() };
});

const getClaims = vi.fn();
const client = { auth: { getClaims } };

function validFormData() {
  const formData = new FormData();
  formData.set("entryId", "40000000-0000-0000-0000-000000000001");
  formData.set("occurredAt", "2026-09-04T12:30");
  formData.set("amount", "128.50");
  formData.set("accountId", "10000000-0000-0000-0000-000000000001");
  formData.set("categoryId", "30000000-0000-0000-0000-000000000001");
  formData.set("budgetBucketId", "20000000-0000-0000-0000-000000000001");
  formData.set("description", "论文投稿费");
  formData.set("excludeFromBudget", "on");
  return formData;
}

describe("updateExpenseTransactionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(client as never);
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null } as never);
  });

  it("validates Auth and updates one real expense through the RPC", async () => {
    vi.mocked(updateExpenseTransaction).mockResolvedValue({
      budgetBucketId: null,
      budgetExcluded: true,
      budgetImpactCreated: false,
      budgetPeriodId: "period-september",
      entryId: "40000000-0000-0000-0000-000000000001",
      lineId: "line-paper",
      warningCode: null,
    });

    const result = await updateExpenseTransactionAction(
      initialExpenseTransactionActionState,
      validFormData(),
    );

    expect(getClaims).toHaveBeenCalledOnce();
    expect(updateExpenseTransaction).toHaveBeenCalledWith(client, {
      accountId: "10000000-0000-0000-0000-000000000001",
      amount: 128.5,
      budgetBucketId: null,
      categoryId: "30000000-0000-0000-0000-000000000001",
      description: "论文投稿费",
      entryId: "40000000-0000-0000-0000-000000000001",
      excludeFromBudget: true,
      memo: null,
      occurredAt: "2026-09-04T12:30:00+08:00",
      rawText: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/finance", "layout");
    expect(result).toMatchObject({ status: "success" });
  });

  it("returns the explicit closed-budget preservation warning", async () => {
    vi.mocked(updateExpenseTransaction).mockResolvedValue({
      budgetBucketId: "bucket-existing",
      budgetExcluded: false,
      budgetImpactCreated: true,
      budgetPeriodId: "period-closed",
      entryId: "40000000-0000-0000-0000-000000000001",
      lineId: "line-paper",
      warningCode: "budget_period_closed_preserved",
    });

    const result = await updateExpenseTransactionAction(
      initialExpenseTransactionActionState,
      validFormData(),
    );

    expect(result).toMatchObject({ status: "warning" });
    expect(result.message).toContain("已关闭预算保持原记录不变");
  });

  it("rejects invalid or unauthenticated edits before calling the RPC", async () => {
    getClaims.mockResolvedValue({ data: null, error: null } as never);
    const result = await updateExpenseTransactionAction(
      initialExpenseTransactionActionState,
      validFormData(),
    );

    expect(result.status).toBe("error");
    expect(updateExpenseTransaction).not.toHaveBeenCalled();
  });

  it("explains why a multi-line expense cannot be edited", async () => {
    vi.mocked(updateExpenseTransaction).mockRejectedValue(
      new FinanceMutationError("expense_entry_must_have_exactly_one_line", "P0001"),
    );

    const result = await updateExpenseTransactionAction(
      initialExpenseTransactionActionState,
      validFormData(),
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("一条分录");
  });
});
