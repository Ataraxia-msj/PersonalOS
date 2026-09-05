import { describe, expect, it, vi } from "vitest";

import {
  getAccountBalances,
  getActiveBudgetExecution,
  getActiveMonthlySummary,
  getBudgetExecutionHistory,
  getExpenseCategories,
  getExpenseTransactionForEdit,
  getMonthlyFinancialSummaries,
  getNetWorth,
  getRecentTransactions,
  getTransactions,
  type FinanceQueryClient,
} from "./queries";

function createQueryDouble(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain = {
    eq: vi.fn((...args: unknown[]) => { calls.push(["eq", ...args]); return chain; }),
    limit: vi.fn((...args: unknown[]) => { calls.push(["limit", ...args]); return chain; }),
    maybeSingle: vi.fn(async () => result),
    order: vi.fn((...args: unknown[]) => { calls.push(["order", ...args]); return chain; }),
    select: vi.fn((...args: unknown[]) => { calls.push(["select", ...args]); return chain; }),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  const from = vi.fn(() => chain);
  return { calls, client: { from } as unknown as FinanceQueryClient, from };
}

describe("Finance View queries", () => {
  it("reads net worth as a single View row", async () => {
    const query = createQueryDouble({ data: { net_worth: 100 }, error: null });

    await expect(getNetWorth(query.client)).resolves.toEqual({ net_worth: 100 });
    expect(query.from).toHaveBeenCalledWith("vw_net_worth");
    expect(query.calls).toContainEqual(["select", "*"]);
  });

  it("reads only active accounts in database sort order", async () => {
    const query = createQueryDouble({ data: [], error: null });

    await getAccountBalances(query.client);

    expect(query.from).toHaveBeenCalledWith("vw_account_balances");
    expect(query.calls).toContainEqual(["eq", "is_active", true]);
    expect(query.calls).toContainEqual(["order", "sort_order", { ascending: true }]);
  });

  it("reads only active expense categories in database sort order", async () => {
    const query = createQueryDouble({ data: [], error: null });

    await getExpenseCategories(query.client);

    expect(query.from).toHaveBeenCalledWith("categories");
    expect(query.calls).toContainEqual(["select", "*"]);
    expect(query.calls).toContainEqual(["eq", "category_type", "expense"]);
    expect(query.calls).toContainEqual(["eq", "is_active", true]);
    expect(query.calls).toContainEqual(["order", "sort_order", { ascending: true }]);
  });

  it("reads active and historical budget execution with stable ordering", async () => {
    const active = createQueryDouble({ data: [], error: null });
    await getActiveBudgetExecution(active.client);
    expect(active.from).toHaveBeenCalledWith("vw_budget_execution");
    expect(active.calls).toContainEqual(["eq", "period_status", "active"]);
    expect(active.calls).toContainEqual(["order", "sort_order", { ascending: true }]);

    const history = createQueryDouble({ data: [], error: null });
    await getBudgetExecutionHistory(history.client);
    expect(history.calls).toContainEqual(["order", "start_date", { ascending: false }]);
    expect(history.calls).toContainEqual(["order", "sort_order", { ascending: true }]);
  });

  it("reads the active summary and seven most recent monthly summaries", async () => {
    const active = createQueryDouble({ data: null, error: null });
    await getActiveMonthlySummary(active.client);
    expect(active.from).toHaveBeenCalledWith("vw_monthly_financial_summary");
    expect(active.calls).toContainEqual(["eq", "status", "active"]);
    expect(active.calls).toContainEqual(["limit", 1]);

    const history = createQueryDouble({ data: [], error: null });
    await getMonthlyFinancialSummaries(history.client);
    expect(history.calls).toContainEqual(["order", "start_date", { ascending: false }]);
    expect(history.calls).toContainEqual(["limit", 7]);
  });

  it("reads confirmed transaction lines in entry and line order without truncating entries", async () => {
    for (const readTransactions of [getRecentTransactions, getTransactions]) {
      const query = createQueryDouble({ data: [], error: null });

      await readTransactions(query.client);

      expect(query.from).toHaveBeenCalledWith("vw_transaction_details");
      expect(query.calls).toContainEqual(["eq", "status", "confirmed"]);
      expect(query.calls).toContainEqual(["order", "occurred_at", { ascending: false }]);
      expect(query.calls).toContainEqual(["order", "line_sort_order", { ascending: true }]);
      expect(query.calls.some(([method]) => method === "limit")).toBe(false);
    }
  });

  it("loads one expense entry and its budget impact without querying page components", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const from = vi.fn((table: string) => {
      const result = table === "vw_transaction_details"
        ? { data: [{ entry_id: "entry-edit" }], error: null }
        : { data: [{ entry_id: "entry-edit", budget_bucket_id: "bucket-food" }], error: null };
      const chain = {
        eq: vi.fn((...args: unknown[]) => { calls.push([`${table}.eq`, ...args]); return chain; }),
        limit: vi.fn((...args: unknown[]) => { calls.push([`${table}.limit`, ...args]); return chain; }),
        order: vi.fn((...args: unknown[]) => { calls.push([`${table}.order`, ...args]); return chain; }),
        select: vi.fn((...args: unknown[]) => { calls.push([`${table}.select`, ...args]); return chain; }),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return chain;
    });

    await expect(getExpenseTransactionForEdit(
      { from } as unknown as FinanceQueryClient,
      "entry-edit",
    )).resolves.toEqual({
      budgetImpacts: [{ entry_id: "entry-edit", budget_bucket_id: "bucket-food" }],
      transactionLines: [{ entry_id: "entry-edit" }],
    });

    expect(from).toHaveBeenCalledWith("vw_transaction_details");
    expect(from).toHaveBeenCalledWith("budget_impacts");
    expect(calls).toContainEqual(["vw_transaction_details.eq", "entry_id", "entry-edit"]);
    expect(calls).toContainEqual(["budget_impacts.eq", "entry_id", "entry-edit"]);
    expect(calls).toContainEqual(["budget_impacts.limit", 2]);
  });

  it("throws a contextual error instead of presenting failed reads as empty data", async () => {
    const query = createQueryDouble({ data: null, error: { message: "permission denied" } });

    await expect(getNetWorth(query.client)).rejects.toThrow(
      "vw_net_worth: permission denied",
    );
  });
});
