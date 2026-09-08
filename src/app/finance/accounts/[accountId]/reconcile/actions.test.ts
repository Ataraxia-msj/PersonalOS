import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { previewReconciliationAction, saveReconciliationAction } from "./actions";
import type { ReconciliationActionState } from "@/lib/finance/reconciliation-types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const accountId = "81000000-0000-0000-0000-000000000001";
const requestId = "83000000-0000-0000-0000-000000000001";
const rpc = vi.fn();
const getClaims = vi.fn();
const idle: ReconciliationActionState = { status: "idle", message: null, errors: {}, preview: null, result: null };
const previewRow = { account_id: accountId, snapshot_at: "2025-01-02T00:00:00Z", estimated_balance: 424.9,
  latest_snapshot_id: null, has_later_snapshot: false, currency: "CNY", account_class: "asset" };
function form() {
  const data = new FormData();
  Object.entries({ accountId, snapshotAt: "2025-01-02T08:00:00", balance: "423.50", note: "checked",
    requestId, expectedBalance: "424.9", expectedSnapshotId: "" }).forEach(([k,v]) => data.set(k,v));
  return data;
}
describe("reconciliation actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createClient).mockResolvedValue({ auth: { getClaims }, rpc } as never);
    getClaims.mockResolvedValue({ data: { claims: { sub: "user" } }, error: null });
    rpc.mockResolvedValue({ data: [previewRow], error: null });
  });
  it("preview reads an as-of balance but never calls the write RPC", async () => {
    const state = await previewReconciliationAction(idle, form());
    expect(state.status).toBe("preview");
    expect(state.preview?.row.estimated_balance).toBe(424.9);
    expect(state.preview?.input.balance).toBe(423.5);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("preview_balance_reconciliation", { p_account_id: accountId, p_snapshot_at: "2025-01-02T00:00:00.000Z" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("saves an authenticated snapshot with the same retry identifier and refreshes Finance", async () => {
    rpc.mockResolvedValue({ data: [{ snapshot_id: requestId, account_id: accountId, snapshot_at: "2025-01-02T00:00:00Z", balance: 423.5, replayed: false }], error: null });
    const result = await saveReconciliationAction(idle, form());
    expect(result.status).toBe("success");
    expect(result.result?.balance).toBe(423.5);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("reconcile_account_balance", { p_request_id: requestId, p_account_id: accountId,
      p_snapshot_at: "2025-01-02T00:00:00.000Z", p_balance: 423.5, p_note: "checked", p_expected_balance: 424.9, p_expected_snapshot_id: null });
    expect(revalidatePath).toHaveBeenCalledWith("/finance", "layout");
  });
  it("rejects unauthenticated preview and save without any database query", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    expect((await previewReconciliationAction(idle, form())).status).toBe("error");
    expect((await saveReconciliationAction(idle, form())).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses confirmation without a preview baseline or valid identifier", async () => {
    const data = form(); data.delete("expectedBalance"); data.set("requestId", "bad");
    expect((await saveReconciliationAction(idle, data)).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("labels a transport failure uncertain, not successful or definitely rolled back", async () => {
    rpc.mockRejectedValue(new Error("fetch failed"));
    expect((await saveReconciliationAction(idle, form())).status).toBe("uncertain");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("requires new preview for stale data and does not refresh", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "stale_reconciliation_preview", code: "40001" } });
    const state = await saveReconciliationAction(idle, form());
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/重新/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("preserves confirmed database success when page refresh throws", async () => {
    rpc.mockResolvedValue({ data: [{ snapshot_id: requestId, account_id: accountId, snapshot_at: "2025-01-02T00:00:00Z", balance: 423.5, replayed: true }], error: null });
    vi.mocked(revalidatePath).mockImplementationOnce(() => { throw Error("refresh failed"); });
    expect((await saveReconciliationAction(idle, form())).status).toBe("success");
  });
});
