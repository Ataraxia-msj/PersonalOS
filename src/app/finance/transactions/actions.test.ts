// @vitest-environment node

import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExpenseTransaction } from "@/lib/finance/mutations";
import { initialExpenseTransactionActionState } from "@/lib/finance/action-state";
import { createClient } from "@/lib/supabase/server";

import {
  createExpenseTransactionAction,
} from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/finance/mutations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/finance/mutations")>();
  return { ...actual, createExpenseTransaction: vi.fn() };
});

const getClaims = vi.fn();
const client = { auth: { getClaims } };

function validFormData() {
  const formData = new FormData();
  formData.set("occurredAt", "2026-09-04T12:30");
  formData.set("amount", "18.50");
  formData.set("accountId", "10000000-0000-0000-0000-000000000001");
  formData.set("categoryId", "30000000-0000-0000-0000-000000000001");
  formData.set("budgetBucketId", "20000000-0000-0000-0000-000000000001");
  formData.set("description", "午餐");
  return formData;
}

describe("createExpenseTransactionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(client as never);
    getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    } as never);
  });

  it("verifies Auth and submits one Asia/Shanghai expense RPC", async () => {
    vi.mocked(createExpenseTransaction).mockResolvedValue({
      budgetBucketId: "20000000-0000-0000-0000-000000000001",
      budgetExcluded: false,
      budgetImpactCreated: true,
      budgetPeriodId: "period-september",
      entryId: "entry-lunch",
      lineId: "line-lunch",
      warningCode: null,
    });

    const result = await createExpenseTransactionAction(
      initialExpenseTransactionActionState,
      validFormData(),
    );

    expect(getClaims).toHaveBeenCalledOnce();
    expect(createExpenseTransaction).toHaveBeenCalledWith(client, {
      accountId: "10000000-0000-0000-0000-000000000001",
      amount: 18.5,
      budgetBucketId: "20000000-0000-0000-0000-000000000001",
      categoryId: "30000000-0000-0000-0000-000000000001",
      description: "午餐",
      excludeFromBudget: false,
      memo: null,
      occurredAt: "2026-09-04T12:30:00+08:00",
      rawText: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/finance", "layout");
    expect(result).toMatchObject({ entryId: "entry-lunch", status: "success" });
  });

  it("returns an explicit warning while still refreshing real Finance data", async () => {
    vi.mocked(createExpenseTransaction).mockResolvedValue({
      budgetBucketId: null,
      budgetExcluded: false,
      budgetImpactCreated: false,
      budgetPeriodId: null,
      entryId: "entry-unbudgeted",
      lineId: "line-unbudgeted",
      warningCode: "no_budget_period",
    });

    const result = await createExpenseTransactionAction(
      initialExpenseTransactionActionState,
      validFormData(),
    );

    expect(result.status).toBe("warning");
    expect(result.message).toContain("没有对应预算月份");
    expect(revalidatePath).toHaveBeenCalledWith("/finance", "layout");
  });

  it("submits an intentional budget exclusion without a bucket", async () => {
    vi.mocked(createExpenseTransaction).mockResolvedValue({
      budgetBucketId: null,
      budgetExcluded: true,
      budgetImpactCreated: false,
      budgetPeriodId: null,
      entryId: "entry-publishing",
      lineId: "line-publishing",
      warningCode: null,
    });
    const formData = validFormData();
    formData.set("excludeFromBudget", "on");
    formData.delete("budgetBucketId");

    const result = await createExpenseTransactionAction(
      initialExpenseTransactionActionState,
      formData,
    );

    expect(createExpenseTransaction).toHaveBeenCalledWith(client, expect.objectContaining({
      budgetBucketId: null,
      excludeFromBudget: true,
    }));
    expect(result).toMatchObject({ entryId: "entry-publishing", status: "success" });
  });

  it("rejects an unauthenticated action without calling the RPC", async () => {
    getClaims.mockResolvedValue({ data: null, error: null } as never);

    const result = await createExpenseTransactionAction(
      initialExpenseTransactionActionState,
      validFormData(),
    );

    expect(result).toMatchObject({ status: "error" });
    expect(result.message).toContain("登录");
    expect(createExpenseTransaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects invalid form values before calling the RPC", async () => {
    const formData = validFormData();
    formData.set("amount", "0");
    formData.set("description", "   ");

    const result = await createExpenseTransactionAction(
      initialExpenseTransactionActionState,
      formData,
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors.amount).toBeDefined();
    expect(result.fieldErrors.description).toBeDefined();
    expect(createExpenseTransaction).not.toHaveBeenCalled();
  });
});
