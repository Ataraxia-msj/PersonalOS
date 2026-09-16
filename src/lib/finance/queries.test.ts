import { describe, expect, it, vi } from "vitest";

import {
  getAccountBalances,
  getActiveBudgetExecution,
  getActiveMonthlySummary,
  getBudgetExecutionHistory,
  getBudgetBuckets,
  getBudgetPeriods,
  getExpenseCategories,
  getIncomeCategories,
  getExpenseTransactionForEdit,
  getMonthlyFinancialSummaries,
  getNetWorth,
  getRecentTransactions,
  getTransactions,
  getTransactionAccountCurrencies,
  type FinanceQueryClient,
} from "./queries";

function createQueryDouble(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain = {
    lte: vi.fn((...args: unknown[]) => { calls.push(["lte", ...args]); return chain; }),
    gte: vi.fn((...args: unknown[]) => { calls.push(["gte", ...args]); return chain; }),
    range: vi.fn((...args: unknown[]) => { calls.push(["range", ...args]); return chain; }),
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
  it("reads currencies including inactive historical accounts from the real balances View", async () => {
    const query = createQueryDouble({ data: [{ account_id: "inactive", currency: "USD" }], error: null });
    expect(await getTransactionAccountCurrencies(query.client)).toEqual([{ account_id: "inactive", currency: "USD" }]);
    expect(query.from).toHaveBeenCalledWith("vw_account_balances");
    expect(query.calls).toContainEqual(["select", "account_id,currency"]);
    expect(query.calls).not.toContainEqual(["eq", "is_active", true]);
  });
  it("reads both transfer lines even when they straddle a page boundary", async () => {
    const first = Array.from({ length: 500 }, (_, i) => ({ entry_id: `entry-${i}`, line_sort_order: 0 }));
    const range = vi.fn().mockImplementation(async (start: number) => ({
      data: start === 0 ? first : [{ entry_id: "entry-499", line_sort_order: 1 }], error: null,
    }));
    const chain = { select: () => chain, eq: () => chain, order: () => chain, range,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: first, error: null }).then(resolve) };
    const rows = await getTransactions({ from: () => chain } as unknown as FinanceQueryClient);
    expect(rows).toHaveLength(501);
    expect(rows.filter((row) => row.entry_id === "entry-499")).toHaveLength(2);
  });
  it("reads net worth as a single View row", async () => {
    const query = createQueryDouble({ data: { net_worth: 100 }, error: null });

    await expect(getNetWorth(query.client)).resolves.toEqual({ net_worth: 100 });
    expect(query.from).toHaveBeenCalledWith("vw_net_worth");
    expect(query.calls).toContainEqual(["select", "*"]);
  });

  it("limits current metrics to the supplied Shanghai business date, not a future active month", async () => {
    for (const read of [getActiveMonthlySummary, getActiveBudgetExecution]) {
      const query = createQueryDouble({ data: [], error: null });
      await read(query.client, "2026-09-30");
      expect(query.calls).toContainEqual(["lte", "start_date", "2026-09-30"]);
      expect(query.calls).toContainEqual(["gte", "end_date", "2026-09-30"]);
    }
  });

  it("reads independent real buckets and checks the attribution migration before form writes", async () => {
    const query = createQueryDouble({ data: [], error: null });
    await expect(getBudgetBuckets(query.client)).resolves.toEqual([]);
    expect(query.from).toHaveBeenCalledWith("budget_buckets");
    expect(query.calls).toContainEqual(["select", "saved_budget_bucket_id"]);
    expect(query.calls).toContainEqual(["range", 0, 499]);
    const outdated = createQueryDouble({ data: null, error: { message: "column missing" } });
    await expect(getBudgetBuckets(outdated.client)).rejects.toThrow("数据库迁移");
    expect(outdated.from).not.toHaveBeenCalledWith("budget_buckets");
  });

  it("continues reading budget history past the first page", async () => {
    const first = Array.from({ length: 500 }, (_, index) => ({ id: `period-${index}` }));
    const range = vi.fn().mockImplementation(async (start: number) => ({
      data: start === 0 ? first : [{ id: "period-500" }], error: null,
    }));
    const chain = { select: () => chain, order: () => chain, range };
    const client = { from: () => chain } as unknown as FinanceQueryClient;
    const rows = await getBudgetPeriods(client);
    expect(rows).toHaveLength(501);
    expect(range.mock.calls).toEqual([[0, 499], [500, 999]]);
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

  it("reads only active income categories in database sort order", async () => {
    const query = createQueryDouble({ data: [], error: null });

    await getIncomeCategories(query.client);

    expect(query.from).toHaveBeenCalledWith("categories");
    expect(query.calls).toContainEqual(["select", "*"]);
    expect(query.calls).toContainEqual(["eq", "category_type", "income"]);
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
