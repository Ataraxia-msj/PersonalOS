import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { AgentConfirmationResult, AgentTransactionDraft } from "@/lib/agent/types";

import { TransactionPreview } from "./transaction-preview";

const draft: AgentTransactionDraft = {
  accountId: "wechat", accountName: "微信", amount: 12, budgetBucketId: "variable",
  budgetBucketName: "变动必要开销", categoryId: "food", categoryName: "餐饮",
  description: "早餐", draftId: "draft-1", excludeFromBudget: false,
  fromAccountId: null, fromAccountName: null, issues: [], memo: null,
  occurredAt: "2026-10-03T08:10", purpose: null, rawText: "微信早餐12",
  requestId: null, sourceText: "微信早餐12", status: "ready", toAccountId: null,
  toAccountName: null, type: "expense",
};

describe("TransactionPreview", () => {
  it("renders resolved real finance labels and readiness", () => {
    render(<TransactionPreview draft={draft} index={0} />);
    expect(screen.getByRole("article", { name: "交易预览 1" })).toHaveTextContent("支出");
    expect(screen.getByText("¥12.00")).toBeVisible();
    expect(screen.getByText("微信")).toBeVisible();
    expect(screen.getByText("餐饮")).toBeVisible();
    expect(screen.getByText("变动必要开销")).toBeVisible();
    expect(screen.getByText("准备确认")).toBeVisible();
  });

  it("renders transfer direction and all blocking issues", () => {
    render(<TransactionPreview index={1} draft={{
      ...draft,
      accountId: null,
      accountName: null,
      budgetBucketId: null,
      budgetBucketName: null,
      categoryId: null,
      categoryName: null,
      description: "转入储蓄",
      fromAccountId: "ccb",
      fromAccountName: "建设银行",
      issues: ["需要选择转入账户", "预算分类与转账用途不匹配"],
      purpose: "saving",
      status: "needs_input",
      toAccountId: null,
      type: "transfer",
    }} />);
    expect(screen.getByText("建设银行 → 待补充")).toBeVisible();
    expect(screen.getByText("需要选择转入账户")).toBeVisible();
    expect(screen.getByText("预算分类与转账用途不匹配")).toBeVisible();
    expect(screen.getByText("需要补充")).toBeVisible();
    expect(screen.queryByRole("button", { name: "确认并记录" })).not.toBeInTheDocument();
  });

  it("requires an explicit click, disables duplicate submission, and shows success", async () => {
    const user = userEvent.setup();
    let resolve!: (value: AgentConfirmationResult) => void;
    const confirmAction = () => new Promise<AgentConfirmationResult>((done) => { resolve = done; });
    render(<TransactionPreview confirmAction={confirmAction} draft={draft} index={0} />);

    expect(screen.getByText("准备确认")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "确认并记录" }));
    expect(screen.getByRole("button", { name: "正在提交" })).toBeDisabled();

    await act(async () => resolve({ entryId: "entry-1", message: "支出已记录，财务数据已刷新。", status: "success" }));
    expect(screen.getByText("支出已记录，财务数据已刷新。")).toBeVisible();
    expect(screen.getByRole("button", { name: "已记录" })).toBeDisabled();
  });

  it("shows a committed warning and prevents a second write", async () => {
    const user = userEvent.setup();
    const confirmAction = async () => ({
      entryId: "entry-1",
      message: "支出已记录，但对应预算月份已关闭。",
      status: "warning",
    } as const);
    render(<TransactionPreview confirmAction={confirmAction} draft={draft} index={0} />);
    await user.click(screen.getByRole("button", { name: "确认并记录" }));
    expect(await screen.findByText(/预算月份已关闭/)).toBeVisible();
    expect(screen.getByRole("button", { name: "已记录" })).toBeDisabled();
  });

  it("keeps sibling cards independently confirmable after one deterministic failure", async () => {
    const user = userEvent.setup();
    const confirmAction = async (submitted: AgentTransactionDraft) => submitted.draftId === "draft-1"
      ? { entryId: null, message: "所选账户已失效，请重新生成预览。", status: "error" as const }
      : { entryId: "entry-2", message: "支出已记录。", status: "success" as const };
    render(<>
      <TransactionPreview confirmAction={confirmAction} draft={draft} index={0} />
      <TransactionPreview confirmAction={confirmAction} draft={{ ...draft, draftId: "draft-2", description: "地铁" }} index={1} />
    </>);

    const cards = screen.getAllByRole("article", { name: /交易预览/ });
    await user.click(within(cards[0]!).getByRole("button", { name: "确认并记录" }));
    expect(await within(cards[0]!).findByText(/账户已失效/)).toBeVisible();
    expect(within(cards[1]!).getByRole("button", { name: "确认并记录" })).toBeEnabled();
  });
});
