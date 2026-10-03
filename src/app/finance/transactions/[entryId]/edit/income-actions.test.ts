// @vitest-environment node

import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IncomeMutationError, updateIncomeTransaction } from "@/lib/finance/income-mutations";
import { createClient } from "@/lib/supabase/server";

import { updateIncomeTransactionAction } from "./income-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/finance/income-mutations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/finance/income-mutations")>();
  return { ...actual, updateIncomeTransaction: vi.fn() };
});

const getClaims = vi.fn();
const client = { auth: { getClaims } };
function validForm() {
  const form = new FormData();
  form.set("entryId", "80000000-0000-0000-0000-000000000001");
  form.set("occurredAt", "2026-09-15T09:00:00");
  form.set("amount", "8500.25");
  form.set("accountId", "10000000-0000-0000-0000-000000000001");
  form.set("categoryId", "30000000-0000-0000-0000-000000000001");
  form.set("description", "九月工资");
  form.set("memo", "税后工资");
  return form;
}

describe("updateIncomeTransactionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.mocked(createClient).mockResolvedValue(client as never);
    getClaims.mockResolvedValue({ data: { claims: { sub: "user" } }, error: null });
    vi.mocked(updateIncomeTransaction).mockResolvedValue({
      entryId: "80000000-0000-0000-0000-000000000001", lineId: "line-salary",
    });
  });

  it("authenticates, validates and updates one income before revalidating Finance", async () => {
    await expect(updateIncomeTransactionAction(validForm())).resolves.toMatchObject({ status: "success" });
    expect(updateIncomeTransaction).toHaveBeenCalledWith(client, {
      entryId: "80000000-0000-0000-0000-000000000001", occurredAt: "2026-09-15T01:00:00.000Z",
      amount: 8500.25, accountId: "10000000-0000-0000-0000-000000000001",
      categoryId: "30000000-0000-0000-0000-000000000001", description: "九月工资",
      memo: "税后工资", rawText: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/finance", "layout");
  });

  it("rejects lost auth and maps structural RPC errors without writing again", async () => {
    getClaims.mockResolvedValueOnce({ data: null, error: null });
    await expect(updateIncomeTransactionAction(validForm())).resolves.toMatchObject({ status: "error" });
    expect(updateIncomeTransaction).not.toHaveBeenCalled();
    getClaims.mockResolvedValueOnce({ data: { claims: { sub: "user" } }, error: null });
    vi.mocked(updateIncomeTransaction).mockRejectedValueOnce(
      new IncomeMutationError("income_entry_must_have_exactly_one_line", "P0001"),
    );
    await expect(updateIncomeTransactionAction(validForm())).resolves.toMatchObject({
      status: "error", message: expect.stringContaining("一条分录"),
    });
  });
});
