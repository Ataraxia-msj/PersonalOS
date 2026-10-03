import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AgentTransactionDraft } from "@/lib/agent/types";

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
  });
});
