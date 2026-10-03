import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { TaskForm } from "./task-form";
import { ConfirmationPanel } from "./confirmation-panel";
import { ActionForm, type AffairsAction } from "./action-form";
import type { AffairsFormData } from "../types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const data: AffairsFormData = {
  resource: "task",
  initialValues: null,
  mainlines: [],
  projects: [],
  tasks: [],
  serverNowISO: "2026-10-03T00:00:00Z",
  taskHistory: [],
};
it("creates ordinary independent tasks with no date and preserves uncertain request and payload", async () => {
  const seen: FormData[] = [];
  const action = vi.fn(async (_s, d: FormData) => {
    seen.push(d);
    return {
      status: "uncertain" as const,
      fieldErrors: {},
      message: "暂不明确",
      receipt: null,
    };
  });
  const user = userEvent.setup();
  render(<TaskForm data={data} mode="create" action={action} />);
  await user.type(screen.getByLabelText("行动名称"), "Ordinary");
  await user.click(screen.getByRole("button", { name: "保存行动" }));
  await screen.findByText("暂不明确");
  expect(seen[0].get("due_date")).toBe("");
  expect(seen[0].get("project_id")).toBe("");
  expect(screen.getByLabelText("行动名称")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "重试同一次提交" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect([...seen[0].entries()]).toEqual([...seen[1].entries()]);
  expect(seen[0].get("requestId")).toBeTruthy();
});
it("shows retained cancellation and restoration history, even after current status is todo", () => {
  const historyData = {
    ...data,
    taskHistory: [
      {
        id: "restore",
        taskId: "t",
        operation: "set_affairs_task_status",
        appliedAt: "2026-10-03T02:00:00Z",
        revision: "3",
        status: "todo",
        reason: null,
        coinDelta: 0,
      },
      {
        id: "cancel",
        taskId: "t",
        operation: "set_affairs_task_status",
        appliedAt: "2026-10-02T02:00:00Z",
        revision: "2",
        status: "cancelled",
        reason: null,
        coinDelta: 0,
      },
    ],
  } as AffairsFormData;
  render(
    <TaskForm
      data={historyData as Extract<AffairsFormData, { resource: "task" }>}
      mode="edit"
      action={vi.fn()}
    />,
  );
  expect(screen.getByText("已取消 · 版本 2")).toBeInTheDocument();
  expect(screen.getByText("待开始 · 版本 3")).toBeInTheDocument();
});
it("reveals completion conditions for explicitly core work", async () => {
  render(<TaskForm data={data} mode="create" action={vi.fn()} />);
  await userEvent.click(screen.getByLabelText("核心行动"));
  expect(screen.getByLabelText("推进的目标")).toBeRequired();
  expect(screen.getByLabelText("完成条件")).toBeRequired();
  expect(screen.queryByText("优先级")).not.toBeInTheDocument();
});
it("focuses confirmation dialog and closes with Escape", async () => {
  const close = vi.fn();
  render(
    <ConfirmationPanel open title="确认" onClose={close}>
      <button>提交</button>
    </ConfirmationPanel>,
  );
  expect(screen.getByRole("dialog", { name: "确认" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  expect(close).toHaveBeenCalled();
});
it("keeps the original unknown submission locked after a failed authenticated retry", async () => {
  const seen: FormData[] = [];
  const action = vi.fn(async (_s, d: FormData) => {
    seen.push(d);
    return seen.length === 1
      ? {
          status: "uncertain" as const,
          fieldErrors: {},
          receipt: null,
          message: "未知",
        }
      : {
          status: "error" as const,
          fieldErrors: {},
          receipt: null,
          message: "登录失效",
        };
  });
  const user = userEvent.setup();
  render(<TaskForm data={data} mode="create" action={action} />);
  await user.type(screen.getByLabelText("行动名称"), "Do once");
  await user.click(screen.getByRole("button", { name: "保存行动" }));
  await screen.findByText("未知");
  await user.click(screen.getByRole("button", { name: "重试同一次提交" }));
  await screen.findByText("登录失效");
  expect(screen.getByLabelText("行动名称")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "重试同一次提交" }));
  await waitFor(() => expect(seen).toHaveLength(3));
  expect([...seen[0].entries()]).toEqual([...seen[2].entries()]);
});
it("permits the opposite operation only after success and a refreshed revision", async () => {
  const action = vi.fn<AffairsAction>(async () => ({
    status: "success" as const,
    fieldErrors: {},
    message: "成功",
    receipt: {
      objectId: "p",
      revision: "2",
      commandId: "c",
      coinDelta: 0,
      balanceAtCommand: 0,
      replayed: false,
    },
  }));
  const element = (revision: string, label: string, status: string) => (
    <ActionForm
      action={action}
      operation="set_affairs_project_status"
      identity={{ id: "p", revision }}
      submitLabel={label}
    >
      <input name="status" type="hidden" value={status} />
      <input name="outcome_confirmed" type="hidden" value="false" />
    </ActionForm>
  );
  const user = userEvent.setup();
  const { rerender } = render(element("1", "暂停项目", "paused"));
  await user.click(screen.getByRole("button", { name: "暂停项目" }));
  await screen.findByText("成功");
  rerender(element("1", "暂停项目", "paused"));
  expect(screen.getByRole("button", { name: "已保存" })).toBeDisabled();
  rerender(element("2", "恢复推进", "active"));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "恢复推进" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "恢复推进" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  const first = action.mock.calls[0][1] as FormData;
  const second = action.mock.calls[1][1] as FormData;
  expect(second.get("requestId")).not.toBe(first.get("requestId"));
  expect(second.get("revision")).toBe("2");
  expect(second.get("status")).toBe("active");
});
