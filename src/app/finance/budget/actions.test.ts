import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveBudgetAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const rpc = vi.fn();
const getClaims = vi.fn();
const idle = { status: "idle" as const, message: null, errors: {}, result: null };
function form() {
  const data = new FormData();
  data.set("month", "2026-09"); data.set("plannedIncome", "100");
  data.set("allocation:82000000-0000-0000-0000-000000000001", "50");
  return data;
}
describe("saveBudgetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({ auth: { getClaims }, rpc } as never);
    getClaims.mockResolvedValue({ data: { claims: { sub: "user" } }, error: null });
    rpc.mockResolvedValue({ data: [{ budget_period_id: "period", period_status: "active", period_updated_at: "2026-09-08T00:00:00Z",
      planned_total_allocated: 50, planned_unallocated: 50, backfilled_count: 2, pending_transaction_count: 1,
      warning_codes: ["unassigned_transactions_remaining"] }], error: null });
  });
  it("authenticates and submits once to the atomic RPC, returns actual counts", async () => {
    const state = await saveBudgetAction(idle, form());
    expect(state.status).toBe("success");
    expect(state.result?.backfilled_count).toBe(2);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_monthly_budget", {
      p_month: "2026-09-01", p_planned_income: 100,
      p_allocations: [{ budget_bucket_id: "82000000-0000-0000-0000-000000000001", planned_amount: 50 }],
      p_period_id: null, p_expected_updated_at: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/finance", "layout");
  });
  it("does not write on invalid session", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "expired" } });
    expect((await saveBudgetAction(idle, form())).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not write invalid amounts even with a valid session", async () => {
    const data = form(); data.set("plannedIncome", "-1");
    const state = await saveBudgetAction(idle, data);
    expect(state.status).toBe("error");
    expect(state.errors.plannedIncome).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("keeps a successful commit successful if subsequent refresh fails", async () => {
    vi.mocked(revalidatePath).mockImplementationOnce(() => { throw Error("refresh failed"); });
    const state = await saveBudgetAction(idle, form());
    expect(state.status).toBe("success");
    expect(state.result?.budget_period_id).toBe("period");
    expect(state.message).toMatch(/已保存/);
  });
  it("reports database conflict without fabricating success", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "budget_version_conflict", code: "P0001" } });
    const state = await saveBudgetAction(idle, form());
    expect(state.status).toBe("error"); expect(state.result).toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
