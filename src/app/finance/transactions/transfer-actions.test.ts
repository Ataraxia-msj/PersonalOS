import { beforeEach, describe, expect, it, vi } from "vitest";
const doubles = vi.hoisted(() => ({ createClient: vi.fn(), refresh: vi.fn(), rpc: vi.fn(), claims: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: doubles.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: doubles.refresh }));
import { createTransferAction } from "./transfer-actions";

const id = "00000000-0000-0000-0000-000000000001";
function form() {
  const data = new FormData();
  Object.entries({ requestId: id, fromAccountId: "00000000-0000-0000-0000-000000000002", toAccountId: "00000000-0000-0000-0000-000000000003",
    amount: "10.25", occurredAt: "2026-01-01T08:00", purpose: "general", description: "调拨" }).forEach(([k, v]) => data.set(k, v));
  return data;
}
const result = { entry_id: id, from_line_id: "00000000-0000-0000-0000-000000000004", to_line_id: "00000000-0000-0000-0000-000000000005",
  budget_impact_created: false, budget_period_id: null, budget_bucket_id: null, warning_code: null, replayed: false };
beforeEach(() => {
  vi.resetAllMocks();
  doubles.createClient.mockResolvedValue({ auth: { getClaims: doubles.claims }, rpc: doubles.rpc });
  doubles.claims.mockResolvedValue({ data: { claims: { sub: "user" } }, error: null });
  doubles.rpc.mockResolvedValue({ data: [result], error: null });
});
describe("transfer action", () => {
  it("validates Auth and writes only one RPC then refreshes Finance", async () => {
    expect((await createTransferAction(form())).status).toBe("success");
    expect(doubles.createClient).toHaveBeenCalledTimes(1);
    expect(doubles.claims).toHaveBeenCalledTimes(1);
    expect(doubles.rpc).toHaveBeenCalledExactlyOnceWith("create_transfer_transaction", expect.objectContaining({ p_request_id: id, p_amount: 10.25 }));
    expect(doubles.refresh).toHaveBeenCalledWith("/finance", "layout");
  });
  it("does not call RPC when unauthenticated or invalid", async () => {
    const invalid = form(); invalid.set("amount", "-1");
    expect((await createTransferAction(invalid)).status).toBe("error");
    doubles.claims.mockResolvedValue({ data: null, error: new Error("expired") });
    expect((await createTransferAction(form())).message).toContain("登录");
    expect(doubles.rpc).not.toHaveBeenCalled();
  });
  it.each(["no_budget_bucket", "no_budget_period", "budget_period_closed", "no_budget_allocation", "budget_currency_mismatch", "budget_not_applied"])("preserves confirmed success with warning %s", async (warning) => {
    doubles.rpc.mockResolvedValue({ data: [{ ...result, warning_code: warning }], error: null });
    const saved = await createTransferAction(form());
    expect(saved.status).toBe("success");
    expect(saved.message).toMatch(/预算/);
    expect(saved.result?.entry_id).toBe(id);
  });
  it("reports missing RPC and rollback errors as definite failure", async () => {
    doubles.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing function" } });
    expect(await createTransferAction(form())).toMatchObject({ status: "error", message: expect.stringContaining("迁移") });
    doubles.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "account_inactive" } });
    expect(await createTransferAction(form())).toMatchObject({ status: "error", message: expect.stringContaining("停用") });
    expect(doubles.refresh).not.toHaveBeenCalled();
  });
  it("keeps transport failure and empty/malformed responses uncertain", async () => {
    doubles.rpc.mockRejectedValueOnce(new Error("fetch failed"));
    expect((await createTransferAction(form())).status).toBe("uncertain");
    for (const data of [[], [{ entry_id: id }], [{ ...result, entry_id: "different" }]]) {
      doubles.rpc.mockResolvedValue({ data, error: null });
      expect((await createTransferAction(form())).status).toBe("uncertain");
    }
    expect(doubles.refresh).not.toHaveBeenCalled();
  });
  it("does not label a committed transaction failed when revalidation fails", async () => {
    doubles.refresh.mockImplementation(() => { throw new Error("refresh failed"); });
    expect(await createTransferAction(form())).toMatchObject({ status: "success", message: expect.stringContaining("刷新") });
  });
});
