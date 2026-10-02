import { describe, expect, it, vi } from "vitest";

import {
  getAccountReferenceState,
  getAllAccountBalances,
  getManagedAccountRows,
} from "./account-management-queries";
import type { FinanceQueryClient } from "./queries";

function queryDouble(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain = {
    eq: vi.fn((...args: unknown[]) => { calls.push(["eq", ...args]); return chain; }),
    limit: vi.fn((...args: unknown[]) => { calls.push(["limit", ...args]); return chain; }),
    order: vi.fn((...args: unknown[]) => { calls.push(["order", ...args]); return chain; }),
    select: vi.fn((...args: unknown[]) => { calls.push(["select", ...args]); return chain; }),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return { calls, chain };
}

describe("account management queries", () => {
  it("reads active and inactive account rows in stable database order", async () => {
    const query = queryDouble({ data: [{ id: "inactive", is_active: false }], error: null });
    const from = vi.fn(() => query.chain);

    await expect(getManagedAccountRows({ from } as unknown as FinanceQueryClient)).resolves.toEqual([
      { id: "inactive", is_active: false },
    ]);

    expect(from).toHaveBeenCalledWith("accounts");
    expect(query.calls).toContainEqual(["select", "*"]);
    expect(query.calls).not.toContainEqual(["eq", "is_active", true]);
    expect(query.calls).toContainEqual(["order", "sort_order", { ascending: true }]);
    expect(query.calls).toContainEqual(["order", "name", { ascending: true }]);
    expect(query.calls).toContainEqual(["order", "id", { ascending: true }]);
  });

  it("reads balances without filtering inactive accounts", async () => {
    const query = queryDouble({ data: [{ account_id: "inactive", is_active: false }], error: null });
    const from = vi.fn(() => query.chain);

    await expect(getAllAccountBalances({ from } as unknown as FinanceQueryClient)).resolves.toHaveLength(1);
    expect(from).toHaveBeenCalledWith("vw_account_balances");
    expect(query.calls).not.toContainEqual(["eq", "is_active", true]);
  });

  it("detects snapshot and journal-line references concurrently", async () => {
    let released = false;
    const snapshots = queryDouble({ count: 1, data: null, error: null });
    const lines = queryDouble({ count: 1, data: null, error: null });
    const gate = Promise.withResolvers<void>();
    snapshots.chain.then = (resolve: (value: { count: number; data: null; error: null }) => unknown) =>
      gate.promise.then(() => resolve({ count: 1, data: null, error: null }));
    lines.chain.then = (resolve: (value: { count: number; data: null; error: null }) => unknown) => {
      released = true;
      gate.resolve();
      return Promise.resolve(resolve({ count: 1, data: null, error: null }));
    };
    const from = vi.fn((table: string) => table === "balance_snapshots" ? snapshots.chain : lines.chain);

    await expect(getAccountReferenceState({ from } as unknown as FinanceQueryClient, "account-1"))
      .resolves.toEqual({ hasLines: true, hasSnapshots: true });
    expect(released).toBe(true);
    expect(from).toHaveBeenCalledWith("balance_snapshots");
    expect(from).toHaveBeenCalledWith("journal_lines");
    expect(snapshots.calls).toContainEqual(["select", "id", { count: "exact", head: true }]);
    expect(lines.calls).toContainEqual(["eq", "account_id", "account-1"]);
  });
});
