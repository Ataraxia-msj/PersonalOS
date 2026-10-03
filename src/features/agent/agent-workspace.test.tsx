import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { AgentActionResult, AgentTransactionDraft } from "@/lib/agent/types";

import { AgentWorkspace } from "./agent-workspace";

const expense = (overrides: Partial<AgentTransactionDraft> = {}): AgentTransactionDraft => ({
  accountId: "wechat",
  accountName: "微信",
  amount: 12,
  budgetBucketId: "variable",
  budgetBucketName: "变动必要开销",
  categoryId: "food",
  categoryName: "餐饮",
  description: "早餐",
  draftId: "draft-breakfast",
  excludeFromBudget: false,
  fromAccountId: null,
  fromAccountName: null,
  issues: [],
  memo: null,
  occurredAt: "2026-10-03T08:10",
  purpose: null,
  rawText: "微信早餐12，地铁3块",
  requestId: null,
  sourceText: "微信早餐12",
  status: "ready",
  toAccountId: null,
  toAccountName: null,
  type: "expense",
  ...overrides,
});

function result(overrides: Partial<NonNullable<AgentActionResult["interpretation"]>> = {}): AgentActionResult {
  const interpretation = {
    message: "识别到两笔支出。",
    transactions: [expense(), expense({ amount: 3, description: "地铁", draftId: "draft-metro", sourceText: "地铁3块" })],
    unresolvedSegments: [],
    ...overrides,
  };
  return { interpretation, message: interpretation.message, status: "success" };
}

describe("AgentWorkspace", () => {
  it("shows a pending state and then renders multiple drafts in source order", async () => {
    const user = userEvent.setup();
    let resolve!: (value: AgentActionResult) => void;
    const action = () => new Promise<AgentActionResult>((done) => { resolve = done; });
    render(<AgentWorkspace action={action} />);

    await user.type(screen.getByRole("textbox", { name: "给 Agent 发消息" }), "微信早餐12，地铁3块");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(screen.getByText("微信早餐12，地铁3块")).toBeVisible();
    expect(screen.getByText("正在识别交易…")).toBeVisible();
    expect(screen.getByRole("button", { name: "正在识别" })).toBeDisabled();

    await act(async () => resolve(result()));

    const previews = screen.getAllByRole("article", { name: /交易预览/ });
    expect(previews).toHaveLength(2);
    expect(within(previews[0]!).getByText("早餐")).toBeVisible();
    expect(within(previews[1]!).getByText("地铁")).toBeVisible();
  });

  it("shows unresolved source text and incomplete draft issues", async () => {
    const user = userEvent.setup();
    render(<AgentWorkspace action={async () => result({
      message: "有一笔需要补充。",
      transactions: [expense({ accountId: null, accountName: null, issues: ["需要选择账户"], status: "needs_input" })],
      unresolvedSegments: ["大概几十块"],
    })} />);

    await user.type(screen.getByRole("textbox", { name: "给 Agent 发消息" }), "晚饭大概几十块");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(await screen.findByText("未能安全识别：大概几十块")).toBeVisible();
    expect(screen.getByText("需要选择账户")).toBeVisible();
    expect(screen.getByText("需要补充")).toBeVisible();
  });

  it("renders a safe server error without inventing a preview", async () => {
    const user = userEvent.setup();
    render(<AgentWorkspace action={async () => ({
      interpretation: null,
      message: "Agent 服务暂时不可用，请稍后重试。",
      status: "error",
    })} />);
    await user.type(screen.getByRole("textbox", { name: "给 Agent 发消息" }), "记录午饭");
    await user.click(screen.getByRole("button", { name: "发送消息" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Agent 服务暂时不可用");
    expect(screen.queryByRole("article", { name: /交易预览/ })).not.toBeInTheDocument();
  });

  it("keeps the initial state when the submitted input is empty", async () => {
    const user = userEvent.setup();
    render(<AgentWorkspace action={async () => result()} />);

    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(screen.getByRole("heading", { name: "今天想处理什么？" })).toBeVisible();
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });
});
