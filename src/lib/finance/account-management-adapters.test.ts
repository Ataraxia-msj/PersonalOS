import { describe, expect, it } from "vitest";

import { adaptAccountEditData, adaptManagedAccounts } from "./account-management-adapters";
import type { AccountRow } from "./types";

const row: AccountRow = {
  account_class: "asset",
  account_type: "money_market",
  created_at: "2026-10-01T00:00:00Z",
  currency: "CNY",
  id: "account-1",
  include_in_net_worth: true,
  institution: "测试机构",
  is_active: false,
  name: "停用账户",
  note: null,
  sort_order: 2,
  updated_at: "2026-10-01T00:00:00Z",
};

describe("account management adapters", () => {
  it("preserves database class/type values and uses null for a missing View balance", () => {
    expect(adaptManagedAccounts([row], [])).toEqual([expect.objectContaining({
      accountClass: "asset",
      accountType: "money_market",
      estimatedBalance: null,
      id: "account-1",
      isActive: false,
    })]);
  });

  it("merges a real balance and exposes structural lock state for editing", () => {
    const balance = {
      account_class: "asset" as const,
      account_id: "account-1",
      account_name: "停用账户",
      account_type: "money_market" as const,
      balance_source: "snapshot" as const,
      currency: "CNY",
      estimated_balance: 123.45,
      include_in_net_worth: true,
      institution: "测试机构",
      is_active: false,
      latest_snapshot_at: "2026-10-01T00:00:00Z",
      latest_snapshot_balance: 123.45,
      ledger_change_after_snapshot: 0,
      sort_order: 2,
    };

    expect(adaptAccountEditData(row, balance, { hasLines: true, hasSnapshots: false }))
      .toEqual(expect.objectContaining({
        estimatedBalance: 123.45,
        hasLines: true,
        hasSnapshots: false,
        structureLocked: true,
      }));
  });
});
