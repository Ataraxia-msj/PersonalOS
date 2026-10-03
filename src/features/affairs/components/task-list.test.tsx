import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { TaskList } from "./task-list";
import type { AffairsTask } from "../types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
it("keeps independent core tasks accessible through all actions", async () => {
  const tasks = [
    {
      id: "t",
      title: "Core",
      isCore: true,
      projectId: null,
      status: "todo",
      revision: "1",
    } as AffairsTask,
  ];
  render(<TaskList tasks={tasks} projects={[]} balance={0} action={vi.fn()} />);
  expect(screen.queryByText("Core")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "全部行动" }));
  expect(screen.getByText("Core")).toBeVisible();
});
