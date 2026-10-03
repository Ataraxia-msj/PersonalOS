import { randomUUID } from "node:crypto";

import { getAgentFinanceOptions } from "@/lib/finance/service";
import { shanghaiDateTime } from "@/lib/finance/reconciliation-validation";

import { interpretFinanceMessage } from "./qwen";
import type {
  AgentFinanceOptions,
  AgentInterpretation,
  AgentInterpretationContext,
  AgentTransactionDraft,
  ModelInterpretation,
  ModelTransactionDraft,
} from "./types";

interface AgentDependencies {
  loadOptions: () => Promise<AgentFinanceOptions>;
  interpret: (context: AgentInterpretationContext) => Promise<ModelInterpretation>;
  uuid: () => string;
}

const defaultDependencies: AgentDependencies = {
  interpret: interpretFinanceMessage,
  loadOptions: getAgentFinanceOptions,
  uuid: randomUUID,
};

function validOccurredAt(value: string | null, now: Date, issues: string[]) {
  if (!value) {
    issues.push("需要交易时间");
    return;
  }
  const normalized = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${normalized}+08:00`);
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)
    || !Number.isFinite(date.getTime()) || shanghaiDateTime(date) !== normalized) {
    issues.push("交易时间无效");
  } else if (date > now) {
    issues.push("日期不能晚于当前时间");
  }
}

function deriveDraft(
  model: ModelTransactionDraft,
  rawText: string,
  options: AgentFinanceOptions,
  now: Date,
  uuid: () => string,
): AgentTransactionDraft {
  const issues: string[] = [];
  if (model.amount === null) issues.push("需要准确金额");
  validOccurredAt(model.occurredAt, now, issues);
  if (!model.description?.trim()) issues.push("需要交易描述");

  const accounts = new Map(options.accounts.map((account) => [account.id, account]));
  const expenseCategories = new Map(options.expenseCategories.map((category) => [category.id, category]));
  const incomeCategories = new Map(options.incomeCategories.map((category) => [category.id, category]));
  const buckets = new Map(options.budgetBuckets.map((bucket) => [bucket.id, bucket]));
  let account = null as AgentFinanceOptions["accounts"][number] | null;
  let category = null as { id: string; name: string; defaultBudgetBucketId?: string | null } | null;
  let fromAccount = null as AgentFinanceOptions["accounts"][number] | null;
  let toAccount = null as AgentFinanceOptions["accounts"][number] | null;
  let bucket = null as AgentFinanceOptions["budgetBuckets"][number] | null;
  let budgetBucketId = model.budgetBucketId;

  if (model.type === "expense") {
    account = model.accountId ? accounts.get(model.accountId) ?? null : null;
    category = model.categoryId ? expenseCategories.get(model.categoryId) ?? null : null;
    if (!account) issues.push(model.accountId ? "账户需要确认" : "需要选择账户");
    if (!category) issues.push(model.categoryId ? "分类需要确认" : "需要选择分类");
    if (model.excludeFromBudget) budgetBucketId = null;
    if (budgetBucketId) {
      bucket = buckets.get(budgetBucketId) ?? null;
      if (!bucket || bucket.kind !== "expense") issues.push("预算分类需要确认");
    } else if (!model.excludeFromBudget && category?.defaultBudgetBucketId) {
      bucket = buckets.get(category.defaultBudgetBucketId) ?? null;
    }
  } else if (model.type === "income") {
    account = model.accountId ? accounts.get(model.accountId) ?? null : null;
    category = model.categoryId ? incomeCategories.get(model.categoryId) ?? null : null;
    budgetBucketId = null;
    if (!account) issues.push(model.accountId ? "账户需要确认" : "需要选择账户");
    else if (account.accountClass !== "asset") issues.push("收入账户必须是资产账户");
    if (!category) issues.push(model.categoryId ? "分类需要确认" : "需要选择分类");
  } else {
    fromAccount = model.fromAccountId ? accounts.get(model.fromAccountId) ?? null : null;
    toAccount = model.toAccountId ? accounts.get(model.toAccountId) ?? null : null;
    if (!model.purpose) issues.push("需要选择转账用途");
    if (!fromAccount) issues.push("需要选择转出账户");
    else if (fromAccount.accountClass !== "asset") issues.push("转出账户必须是资产账户");
    if (!toAccount) issues.push("需要选择转入账户");
    else if (model.purpose === "debt" && toAccount.accountClass !== "liability") issues.push("还款必须转入负债账户");
    else if (model.purpose !== "debt" && toAccount.accountClass !== "asset") issues.push("转入账户必须是资产账户");
    if (fromAccount && toAccount && fromAccount.id === toAccount.id) issues.push("转出和转入账户不能相同");
    if (fromAccount && toAccount && fromAccount.currency !== toAccount.currency) issues.push("转账账户币种必须一致");
    if (model.purpose === "general") budgetBucketId = null;
    if (budgetBucketId) {
      bucket = buckets.get(budgetBucketId) ?? null;
      if (!bucket || bucket.kind !== model.purpose) issues.push("预算分类与转账用途不匹配");
    }
  }

  return {
    ...model,
    accountId: model.type === "transfer" ? null : model.accountId,
    accountName: account?.name ?? null,
    budgetBucketId,
    budgetBucketName: model.excludeFromBudget ? null : bucket?.name ?? null,
    categoryId: model.type === "transfer" ? null : model.categoryId,
    categoryName: category?.name ?? null,
    draftId: uuid(),
    fromAccountId: model.type === "transfer" ? model.fromAccountId : null,
    fromAccountName: fromAccount?.name ?? null,
    issues,
    purpose: model.type === "transfer" ? model.purpose : null,
    rawText,
    requestId: model.type === "expense" ? null : uuid(),
    status: issues.length === 0 ? "ready" : "needs_input",
    toAccountId: model.type === "transfer" ? model.toAccountId : null,
    toAccountName: toAccount?.name ?? null,
  };
}

export async function interpretAgentMessage(
  rawText: string,
  now = new Date(),
  dependencies: AgentDependencies = defaultDependencies,
): Promise<AgentInterpretation> {
  const options = await dependencies.loadOptions();
  const model = await dependencies.interpret({
    ...options,
    nowShanghai: shanghaiDateTime(now).slice(0, 16),
    rawText,
  });
  return {
    message: model.message,
    transactions: model.transactions.map((draft) => deriveDraft(
      draft,
      rawText,
      options,
      now,
      dependencies.uuid,
    )),
    unresolvedSegments: model.unresolvedSegments,
  };
}
