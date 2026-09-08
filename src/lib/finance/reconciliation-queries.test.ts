import { describe, expect, it, vi } from "vitest";
import type { FinanceQueryClient } from "./queries";
import { getReconciliationAccount, getBalanceSnapshotHistory } from "./reconciliation-queries";

function clientDouble() {
  const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), maybeSingle: vi.fn() };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.order.mockReturnValue(chain);
  const from = vi.fn(() => chain);
  return { chain, from, client: { from } as unknown as FinanceQueryClient };
}
describe("reconciliation queries", () => {
  it("looks up one real account by its View account_id", async () => {
    const { chain, from, client } = clientDouble();
    chain.maybeSingle.mockResolvedValue({ data: { account_id: "account" }, error: null });
    expect((await getReconciliationAccount(client, "account"))?.account_id).toBe("account");
    expect(from).toHaveBeenCalledWith("vw_account_balances"); expect(chain.eq).toHaveBeenCalledWith("account_id", "account");
  });
  it("paginates only the chosen account's immutable history and does not fabricate deltas", async () => {
    const { chain, from, client } = clientDouble();
    chain.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_,i) => ({ id: String(i) })), error: null })
      .mockResolvedValueOnce({ data: [{ id: "last" }], error: null });
    expect(await getBalanceSnapshotHistory(client, "account")).toHaveLength(501);
    expect(from).toHaveBeenCalledWith("balance_snapshots");
    expect(chain.eq).toHaveBeenCalledWith("account_id", "account");
    expect(chain.order).toHaveBeenCalledWith("snapshot_at", { ascending: false });
    expect(chain.range.mock.calls).toEqual([[0,499],[500,999]]);
  });
  it("propagates query failures rather than showing a misleading empty history", async () => {
    const { chain, client } = clientDouble();
    chain.range.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(getBalanceSnapshotHistory(client, "account")).rejects.toThrow("permission denied");
  });
});
