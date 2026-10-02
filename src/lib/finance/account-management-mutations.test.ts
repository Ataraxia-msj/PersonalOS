import { describe, expect, it, vi } from "vitest";

import {
  AccountManagementMutationError,
  createManagedAccount,
  setManagedAccountActive,
  updateManagedAccount,
  type AccountManagementMutationClient,
} from "./account-management-mutations";

const base = {
  accountClass: "asset" as const,
  accountType: "bank" as const,
  currency: "CNY",
  includeInNetWorth: true,
  institution: null,
  name: "日常账户",
  note: null,
  sortOrder: 0,
};

describe("account management mutations", () => {
  it("calls create_account once with exact typed arguments", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      account_id: "a", snapshot_id: "s", account_updated_at: "v", replayed: false,
    }], error: null });
    const input = { ...base, balanceAt: "2026-10-02T01:30:00.000Z", initialBalance: 9.5, requestId: "request" };
    await expect(createManagedAccount({ rpc } as unknown as AccountManagementMutationClient, input))
      .resolves.toEqual({ accountId: "a", snapshotId: "s", updatedAt: "v", replayed: false });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("create_account", {
      p_account_class: "asset", p_account_type: "bank", p_balance_at: input.balanceAt,
      p_currency: "CNY", p_include_in_net_worth: true, p_initial_balance: 9.5,
      p_institution: null, p_name: "日常账户", p_note: null, p_request_id: "request", p_sort_order: 0,
    });
  });

  it("calls update and activation RPCs with optimistic concurrency values", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ account_id: "a", account_updated_at: "v2", structure_locked: true }], error: null })
      .mockResolvedValueOnce({ data: [{ account_id: "a", account_updated_at: "v3", is_active: false }], error: null });
    const client = { rpc } as unknown as AccountManagementMutationClient;
    await updateManagedAccount(client, { ...base, accountId: "a", expectedUpdatedAt: "v1" });
    await setManagedAccountActive(client, { accountId: "a", expectedUpdatedAt: "v2", isActive: false });
    expect(rpc).toHaveBeenNthCalledWith(1, "update_account", expect.objectContaining({
      p_account_id: "a", p_expected_updated_at: "v1", p_name: "日常账户",
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, "set_account_active", {
      p_account_id: "a", p_expected_updated_at: "v2", p_is_active: false,
    });
  });

  it("preserves database error details and rejects empty results", async () => {
    const failed = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "40001", message: "stale_account" } }) };
    await expect(setManagedAccountActive(failed as unknown as AccountManagementMutationClient, {
      accountId: "a", expectedUpdatedAt: "v", isActive: true,
    })).rejects.toEqual(new AccountManagementMutationError("stale_account", "40001"));

    const empty = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };
    await expect(createManagedAccount(empty as unknown as AccountManagementMutationClient, {
      ...base, balanceAt: "time", initialBalance: 0, requestId: "request",
    })).rejects.toThrow("create_account returned no result");
  });
});
