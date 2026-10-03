// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { AgentFinanceOptions, ModelInterpretation, ModelTransactionDraft } from "./types";
import { interpretAgentMessage } from "./orchestrator";

const options: AgentFinanceOptions = {
  accounts: [
    { accountClass: "asset", currency: "CNY", id: "wechat", name: "微信" },
    { accountClass: "asset", currency: "CNY", id: "ccb", name: "建设银行" },
    { accountClass: "asset", currency: "CNY", id: "pocket", name: "存钱小荷包" },
    { accountClass: "liability", currency: "CNY", id: "loan", name: "助学贷款" },
  ],
  budgetBuckets: [
    { id: "variable", kind: "expense", name: "变动必要开销" },
    { id: "saving", kind: "saving", name: "储蓄" },
    { id: "debt", kind: "debt", name: "还款" },
  ],
  expenseCategories: [
    { defaultBudgetBucketId: "variable", id: "food", name: "餐饮" },
    { defaultBudgetBucketId: null, id: "study", name: "学习" },
  ],
  incomeCategories: [{ id: "salary", name: "工资" }],
};

const baseDraft: ModelTransactionDraft = {
  accountId: "wechat",
  amount: 12,
  budgetBucketId: "variable",
  categoryId: "food",
  description: "早餐",
  excludeFromBudget: false,
  fromAccountId: null,
  memo: null,
  occurredAt: "2026-10-03T08:10",
  purpose: null,
  sourceText: "微信早餐12",
  toAccountId: null,
  type: "expense",
};

function dependencies(model: ModelInterpretation) {
  let next = 0;
  return {
    interpret: async () => model,
    loadOptions: async () => options,
    uuid: () => `id-${++next}`,
  };
}

describe("interpretAgentMessage", () => {
  it("preserves two expense drafts and resolves their real labels", async () => {
    const result = await interpretAgentMessage("微信早餐12，地铁3块", new Date("2026-10-03T02:00:00Z"), dependencies({
      message: "识别到两笔支出。",
      transactions: [baseDraft, { ...baseDraft, amount: 3, description: "地铁", sourceText: "地铁3块" }],
      unresolvedSegments: [],
    }));

    expect(result.transactions.map((draft) => ({
      account: draft.accountName,
      amount: draft.amount,
      category: draft.categoryName,
      id: draft.draftId,
      ready: draft.status,
    }))).toEqual([
      { account: "微信", amount: 12, category: "餐饮", id: "id-1", ready: "ready" },
      { account: "微信", amount: 3, category: "餐饮", id: "id-2", ready: "ready" },
    ]);
  });

  it("creates stable request identities for income and transfer drafts", async () => {
    const result = await interpretAgentMessage("昨天建行收工资8000，然后转2000到存钱小荷包", new Date("2026-10-03T02:00:00Z"), dependencies({
      message: "识别到收入和转账。",
      transactions: [
        { ...baseDraft, accountId: "ccb", amount: 8000, budgetBucketId: null, categoryId: "salary",
          description: "工资", occurredAt: "2026-10-02T09:00", sourceText: "建行收工资8000", type: "income" },
        { ...baseDraft, accountId: null, amount: 2000, budgetBucketId: null, categoryId: null,
          description: "转入存钱小荷包", fromAccountId: "ccb", occurredAt: "2026-10-02T09:05",
          purpose: "general", sourceText: "转2000到存钱小荷包", toAccountId: "pocket", type: "transfer" },
      ],
      unresolvedSegments: [],
    }));

    expect(result.transactions.map((draft) => [draft.draftId, draft.requestId, draft.status])).toEqual([
      ["id-1", "id-2", "ready"],
      ["id-3", "id-4", "ready"],
    ]);
    expect(result.transactions[1]).toMatchObject({ fromAccountName: "建设银行", toAccountName: "存钱小荷包" });
  });

  it("keeps explicitly budget-excluded expenses ready without a bucket", async () => {
    const result = await interpretAgentMessage("论文投稿618，不计预算", new Date("2026-10-03T02:00:00Z"), dependencies({
      message: "识别到一笔不计预算支出。",
      transactions: [{ ...baseDraft, amount: 618, budgetBucketId: null, categoryId: "study",
        description: "论文投稿", excludeFromBudget: true, sourceText: "论文投稿618，不计预算" }],
      unresolvedSegments: [],
    }));

    expect(result.transactions[0]).toMatchObject({ budgetBucketName: null, excludeFromBudget: true, issues: [], status: "ready" });
  });

  it("rejects invented identifiers, future dates, and incompatible transfer direction", async () => {
    const result = await interpretAgentMessage("含糊交易", new Date("2026-10-03T02:00:00Z"), dependencies({
      message: "需要补充信息。",
      transactions: [
        { ...baseDraft, accountId: "invented", categoryId: "invented", occurredAt: "2026-10-04T08:00" },
        { ...baseDraft, accountId: null, budgetBucketId: "saving", categoryId: null, description: "错误转账",
          fromAccountId: "loan", purpose: "saving", toAccountId: "wechat", type: "transfer" },
      ],
      unresolvedSegments: ["大概几十块"],
    }));

    expect(result.transactions[0]?.status).toBe("needs_input");
    expect(result.transactions[0]?.issues).toEqual(expect.arrayContaining(["账户需要确认", "分类需要确认", "日期不能晚于当前时间"]));
    expect(result.transactions[1]?.issues).toContain("转出账户必须是资产账户");
    expect(result.unresolvedSegments).toEqual(["大概几十块"]);
  });

  it("does not guess missing amount, account, category, or date", async () => {
    const result = await interpretAgentMessage("晚饭几十块", new Date("2026-10-03T02:00:00Z"), dependencies({
      message: "需要补充。",
      transactions: [{ ...baseDraft, accountId: null, amount: null, categoryId: null, occurredAt: null }],
      unresolvedSegments: [],
    }));

    expect(result.transactions[0]).toMatchObject({
      issues: ["需要准确金额", "需要交易时间", "需要选择账户", "需要选择分类"],
      status: "needs_input",
    });
  });

  it("normalizes an explicit provider timezone offset into Shanghai local time", async () => {
    const result = await interpretAgentMessage("微信早餐12", new Date("2026-10-03T02:00:00Z"), dependencies({
      message: "识别到一笔支出。",
      transactions: [{ ...baseDraft, occurredAt: "2026-10-03T08:10+08:00" }],
      unresolvedSegments: [],
    }));

    expect(result.transactions[0]).toMatchObject({
      issues: [],
      occurredAt: "2026-10-03T08:10",
      status: "ready",
    });
  });
});
