import { it, expect, vi } from "vitest";
import { executeRewardCommand } from "./reward-mutations";
import type { AffairsQueryClient } from "./queries";
it("preserves original replay receipt, not a guessed live balance", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: [
      {
        object_id: "o",
        object_revision: "2",
        command_id: "c",
        coin_delta: 1,
        balance_coins: 1,
        replayed: true,
      },
    ],
    error: null,
  });
  const command = {
    operation: "complete_affairs_task" as const,
    args: {
      p_request_id: "r",
      p_task_id: "t",
      p_expected_revision: "1",
      p_completion_confirmed: true,
    },
  };
  expect(
    await executeRewardCommand(
      { rpc } as unknown as AffairsQueryClient,
      command,
    ),
  ).toMatchObject({ balanceAtCommand: 1, replayed: true });
  expect(rpc).toHaveBeenCalledWith(command.operation, command.args);
});
