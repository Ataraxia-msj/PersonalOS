import { describe, it, expect, vi } from "vitest";
import {
  getAffairsCoinLedger,
  getAffairsCoinBalance,
  getAffairsTasks,
  getAffairsTaskHistory,
  type AffairsQueryClient,
} from "./queries";
function query(data: unknown = [], error: unknown = null) {
  const calls: unknown[][] = [];
  const chain = {
    select: (...v: unknown[]) => {
      calls.push(["select", ...v]);
      return chain;
    },
    order: (...v: unknown[]) => {
      calls.push(["order", ...v]);
      return chain;
    },
    lt: (...v: unknown[]) => {
      calls.push(["lt", ...v]);
      return chain;
    },
    eq: (...v: unknown[]) => {
      calls.push(["eq", ...v]);
      return chain;
    },
    in: (...v: unknown[]) => {
      calls.push(["in", ...v]);
      return chain;
    },
    limit: (...v: unknown[]) => {
      calls.push(["limit", ...v]);
      return chain;
    },
    or: (...v:unknown[])=>{calls.push(['or',...v]);return chain;},
    range: (...v: unknown[]) => {
      calls.push(["range", ...v]);
      return Promise.resolve({ data, error });
    },
    maybeSingle: () => Promise.resolve({ data, error }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as AffairsQueryClient, from, calls };
}
describe("real affairs queries", () => {
  it("pages the precomputed ledger by decimal sequence", async () => {
    const q = query();
    await getAffairsCoinLedger(q.client, "9007199254740993");
    expect(q.from).toHaveBeenCalledWith("vw_affairs_coin_ledger");
    expect(q.calls).toContainEqual([
      "lt",
      "wallet_sequence",
      "9007199254740993",
    ]);
    expect(q.calls).toContainEqual([
      "order",
      "wallet_sequence",
      { ascending: false },
    ]);
    expect(q.calls).toContainEqual(["limit", 30]);
  });
  it("reads task table filtered by project", async () => {
    const q = query();
    await getAffairsTasks(q.client, "p");
    expect(q.from).toHaveBeenCalledWith("affairs_tasks");
    expect(q.calls).toContainEqual(["eq", "project_id", "p"]);
  });
  it.each(["PGRST205", "42703", "network"])(
    "never turns %s into fake empty state",
    async (code) => {
      const q = query(null, { code, message: code });
      await expect(getAffairsTasks(q.client)).rejects.toThrow(code);
    },
  );
  it("allows legitimate missing wallet", async () => {
    const q = query(null);
    expect(await getAffairsCoinBalance(q.client)).toBeNull();
  });
  it("reads persisted owner command history for one task, not just its current state", async () => {
    const q = query();
    await getAffairsTaskHistory(
      q.client,
      "a0000000-0000-0000-0000-000000000001",
    );
    expect(q.from).toHaveBeenCalledWith("affairs_commands");
    expect(q.calls.find(c=>c[0]==='or')).toEqual(['or',expect.stringContaining('result->>object_id.eq.a0000000-0000-0000-0000-000000000001')]);
    expect(q.calls).toContainEqual([
      "order",
      "applied_at",
      { ascending: false },
    ]);
    const filter=String(q.calls.find(c=>c[0]==='or')?.[1]);
    expect(filter).toContain('operation.eq.resolve_affairs_inbox_entry');
    expect(filter).toContain('result->>resolved_resource.eq.task');
    expect(filter).toContain('result->>resolved_object_id.eq.a0000000-0000-0000-0000-000000000001');
  });
});
