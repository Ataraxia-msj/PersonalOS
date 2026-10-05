import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { TaskCompletionPanel } from "./task-completion-panel";
import type { AffairsTask } from "../types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const task = {
  id: "t",
  revision: "1",
  title: "Core",
  status: "todo",
  isCore: true,
  completionCriteria: "Deliver",
  coreReason: "Goal",
} as AffairsTask;
it("offers an accessible checkbox-style trigger without prematurely submitting",async()=>{
 const action=vi.fn();render(<TaskCompletionPanel task={task} currentBalance={0} action={action} triggerVariant="checkbox"/>);
 await userEvent.click(screen.getByRole("button",{name:"完成：Core"}));
 expect(screen.getByRole("dialog",{name:"确认行动完成"})).toBeVisible();
 expect(action).not.toHaveBeenCalled();
});
it("only displays earned coin feedback after a confirmed non-replay success", async () => {
  const action = vi.fn(async () => ({
    status: "success" as const,
    fieldErrors: {},
    message: "已保存",
    receipt: {
      objectId: "t",
      revision: "2",
      commandId: "c",
      coinDelta: 1,
      balanceAtCommand: 1,
      replayed: false,
    },
  }));
  render(
    <TaskCompletionPanel task={task} currentBalance={0} action={action} />,
  );
  expect(screen.queryByText("已到账 +1 金币")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "确认完成" }));
  await userEvent.click(screen.getByLabelText("确认已满足完成条件"));
  await userEvent.click(
    screen.getByRole("button", { name: "完成并领取 1 金币" }),
  );
  expect(await screen.findByText("已到账 +1 金币")).toBeVisible();
});
it("normal reopen and erroneous completion are separate operations", () => {
  render(
    <TaskCompletionPanel
      task={{ ...task, status: "done" }}
      currentBalance={1}
      action={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "重新打开" })).toBeVisible();
  expect(screen.getByRole("button", { name: "撤销误完成" })).toBeVisible();
});
it("does not replay coin animation on an idempotent receipt", async () => {
  const action = vi.fn(async () => ({
    status: "success" as const,
    fieldErrors: {},
    message: "原提交",
    receipt: {
      objectId: "t",
      revision: "2",
      commandId: "c",
      coinDelta: 1,
      balanceAtCommand: 1,
      replayed: true,
    },
  }));
  render(
    <TaskCompletionPanel task={task} currentBalance={3} action={action} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "确认完成" }));
  await userEvent.click(screen.getByLabelText("确认已满足完成条件"));
  await userEvent.click(
    screen.getByRole("button", { name: "完成并领取 1 金币" }),
  );
  await screen.findByText("原提交");
  expect(screen.queryByText("已到账 +1 金币")).not.toBeInTheDocument();
  expect(screen.getByText("当前余额 3 金币")).toBeVisible();
});
