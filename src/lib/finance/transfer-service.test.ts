import { beforeEach, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ client: vi.fn(), accounts: vi.fn(), buckets: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: d.client }));
vi.mock("./queries", () => ({ getAccountBalances: d.accounts, getBudgetBuckets: d.buckets }));
import { getTransferFormData } from "./transfer-service";
beforeEach(() => { vi.resetAllMocks(); d.client.mockResolvedValue({}); });
it("loads accounts and buckets concurrently using one client and no expense category query", async () => {
  let resolveAccounts!: (rows: unknown[]) => void;
  d.accounts.mockReturnValue(new Promise((resolve) => { resolveAccounts = resolve; }));
  d.buckets.mockResolvedValue([
    { id: "saving", name: "实际储蓄名称", bucket_kind: "saving", is_active: true },
    { id: "expense", name: "消费", bucket_kind: "expense", is_active: true },
    { id: "inactive", name: "停用", bucket_kind: "investment", is_active: false },
  ]);
  const request = getTransferFormData();
  await vi.waitFor(() => expect(d.buckets).toHaveBeenCalledOnce());
  resolveAccounts([{ account_id: "real", account_name: "真实账户", account_class: "asset", currency: "USD", estimated_balance: 19.28, institution: null, is_active: true }]);
  expect(await request).toEqual({ accounts: [{ id: "real", name: "真实账户", accountClass: "asset", currency: "USD", balance: 19.28, institution: null }],
    budgetBuckets: [{ id: "saving", name: "实际储蓄名称", kind: "saving" }] });
  expect(d.client).toHaveBeenCalledOnce();
});
it("does not turn failed real queries into mock or empty results", async () => {
  d.accounts.mockRejectedValue(new Error("database unavailable")); d.buckets.mockResolvedValue([]);
  await expect(getTransferFormData()).rejects.toThrow("database unavailable");
});
