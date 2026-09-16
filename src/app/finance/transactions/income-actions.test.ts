// @vitest-environment node

import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createIncomeTransaction } from "@/lib/finance/income-mutations";
import { createClient } from "@/lib/supabase/server";

import { createIncomeAction } from "./income-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/finance/income-mutations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/finance/income-mutations")>();
  return { ...actual, createIncomeTransaction: vi.fn() };
});

const getClaims = vi.fn();
const client = { auth: { getClaims } };

function validFormData() {
  const data = new FormData();
  data.set("requestId", "90000000-0000-0000-0000-000000000001");
  data.set("occurredAt", "2026-09-14T09:00:00");
  data.set("amount", "8500.25");
  data.set("accountId", "10000000-0000-0000-0000-000000000001");
  data.set("categoryId", "30000000-0000-0000-0000-000000000001");
  data.set("description", "九月工资");
  return data;
}

describe("createIncomeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(client as never);
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    vi.mocked(createIncomeTransaction).mockResolvedValue({
      entryId: "90000000-0000-0000-0000-000000000001",
      lineId: "line-salary",
      replayed: false,
    });
  });

  it("authenticates, writes one income RPC, and refreshes Finance", async () => {
    const result = await createIncomeAction(validFormData());

    expect(getClaims).toHaveBeenCalledOnce();
    expect(createIncomeTransaction).toHaveBeenCalledWith(client, expect.objectContaining({
      accountId: "10000000-0000-0000-0000-000000000001",
      amount: 8500.25,
      categoryId: "30000000-0000-0000-0000-000000000001",
      description: "九月工资",
      requestId: "90000000-0000-0000-0000-000000000001",
    }));
    expect(revalidatePath).toHaveBeenCalledWith("/finance", "layout");
    expect(result).toMatchObject({ status: "success", result: { replayed: false } });
  });

  it("rejects unauthenticated and invalid requests before calling the RPC", async () => {
    getClaims.mockResolvedValueOnce({ data: null, error: null });
    await expect(createIncomeAction(validFormData())).resolves.toMatchObject({ status: "error" });
    expect(createIncomeTransaction).not.toHaveBeenCalled();

    getClaims.mockResolvedValueOnce({ data: { claims: { sub: "user-1" } }, error: null });
    const invalid = validFormData();
    invalid.set("amount", "0");
    const result = await createIncomeAction(invalid);
    expect(result.errors.amount).toBeDefined();
    expect(createIncomeTransaction).not.toHaveBeenCalled();
  });
});
