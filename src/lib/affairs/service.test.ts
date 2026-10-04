import { describe, it, expect, vi } from "vitest";
import { createAffairsServices } from "./service";
import type { AffairsQueryClient } from "./queries";
describe("affairs parallel service", () => {
  it("creates one client and starts independent reads before resolving any", async () => {
    const started: string[] = [];
    const resolves: Array<(v: { data: unknown; error: null }) => void> = [];
    const from = (name: string) => {
      started.push(name);
      const result = new Promise<{ data: unknown; error: null }>((resolve) =>
        resolves.push(resolve),
      );
      const chain = {
        select: () => chain,
        order: () => chain,
        gte: () => chain,
        lte: () => chain,
        range: () => result,
        maybeSingle: () => result,
        then: result.then.bind(result),
      };
      return chain;
    };
    const factory = vi.fn(
      async () => ({ from }) as unknown as AffairsQueryClient,
    );
    const pending = createAffairsServices(factory).getAffairsDashboardData(
      new Date("2026-10-03T00:00Z"),
    );
    await Promise.resolve();
    expect(started).toHaveLength(6);
    expect(new Set(started).size).toBe(6);
    resolves.forEach((r, i) =>
      r({
        data: started[i] === "vw_affairs_coin_balance" ? null : [],
        error: null,
      }),
    );
    expect((await pending).balance).toBe(0);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
it("passes real task cancel/restore command history through the service and adapter", async () => {
  const id = "a0000000-0000-0000-0000-000000000001";
  const at = "2026-10-03T00:00:00Z";
  const task = {
    id,
    user_id: "u",
    created_at: at,
    updated_at: at,
    revision: 3,
    project_id: null,
    title: "Task",
    description: null,
    is_core: false,
    core_reason: null,
    completion_criteria: null,
    status: "todo",
    waiting_reason: null,
    due_date: null,
    completed_at: null,
    ever_completed: false,
    completion_cycle: 0,
    reward_state: "never",
  };
  const command = (revision: number, status: string) => ({
    id: "c" + revision,
    user_id: "u",
    created_at: at,
    request_id: "r" + revision,
    operation: "set_affairs_task_status",
    payload: { status },
    result: {
      object_id: id,
      object_revision: revision,
      command_id: "c" + revision,
      coin_delta: 0,
      balance_coins: 0,
      replayed: false,
    },
    applied_at: at,
  });
  const rows: Record<string, unknown[]> = {
    affairs_tasks: [task],
    affairs_commands: [command(3, "todo"), command(2, "cancelled")],
  };
  const from = vi.fn((name: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      or: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({data:null,error:null}),
      order: () => chain,
      range: async () => ({ data: rows[name] ?? [], error: null }),
    };
    return chain;
  });
  const factory = vi.fn(
    async () => ({ from }) as unknown as AffairsQueryClient,
  );
  const data = await createAffairsServices(factory).getAffairsFormData(
    "task",
    id,
  );
  expect(data?.resource).toBe("task");
  if (data?.resource !== "task") throw new Error("wrong form");
  expect(data.taskHistory.map((h) => [h.status, h.revision])).toEqual([
    ["todo", "3"],
    ["cancelled", "2"],
  ]);
  expect(from).toHaveBeenCalledWith("affairs_commands");
  expect(factory).toHaveBeenCalledTimes(1);
});
