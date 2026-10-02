import { beforeEach, describe, expect, it, vi } from "vitest";

const d = vi.hoisted(() => ({
  client: vi.fn(),
  rows: vi.fn(),
  balances: vi.fn(),
  refs: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: d.client }));
vi.mock("./account-management-queries", () => ({
  getAccountReferenceState: d.refs,
  getAllAccountBalances: d.balances,
  getManagedAccountRows: d.rows,
}));

import { getAccountEditData, getAccountManagementPageData } from "./account-management-service";

describe("account management service", () => {
  const client = { marker: "client" };

  beforeEach(() => {
    vi.clearAllMocks();
    d.client.mockResolvedValue(client);
    d.rows.mockResolvedValue([]);
    d.balances.mockResolvedValue([]);
    d.refs.mockResolvedValue({ hasLines: false, hasSnapshots: false });
  });

  it("loads account rows and balances concurrently through one server client", async () => {
    const gate = Promise.withResolvers<void>();
    d.rows.mockImplementation(async () => { await gate.promise; return []; });
    d.balances.mockImplementation(async () => { gate.resolve(); return []; });

    await expect(getAccountManagementPageData()).resolves.toEqual([]);
    expect(d.client).toHaveBeenCalledOnce();
    expect(d.rows).toHaveBeenCalledWith(client);
    expect(d.balances).toHaveBeenCalledWith(client);
  });

  it("returns null for an unknown account without reference queries", async () => {
    await expect(getAccountEditData("missing")).resolves.toBeNull();
    expect(d.client).toHaveBeenCalledOnce();
    expect(d.refs).not.toHaveBeenCalled();
  });

  it("loads balance and reference state for the selected edit record", async () => {
    d.rows.mockResolvedValue([{ id: "account-1" }]);
    d.balances.mockResolvedValue([{ account_id: "account-1", estimated_balance: 9 }]);

    await expect(getAccountEditData("account-1")).resolves.toEqual(expect.objectContaining({ id: "account-1" }));
    expect(d.refs).toHaveBeenCalledWith(client, "account-1");
  });
});
