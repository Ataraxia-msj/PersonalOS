import type { SupabaseClient } from "@supabase/supabase-js";

import { moneyToCents } from "@/lib/finance/budget-validation";
import {
  createIncomeTransaction,
  type CreateIncomeTransactionResult,
} from "@/lib/finance/income-mutations";
import {
  createExpenseTransaction,
  type CreateExpenseTransactionResult,
} from "@/lib/finance/mutations";
import { reconciliationUuid, shanghaiDateTime } from "@/lib/finance/reconciliation-validation";
import { createTransferTransaction } from "@/lib/finance/transfer-mutations";
import type { TransferResult } from "@/lib/finance/transfer-types";
import type { Database } from "@/lib/finance/types";

import type {
  AgentConfirmationResult,
  AgentFinanceOptions,
  AgentTransactionDraft,
} from "./types";

type AgentMutationClient = SupabaseClient<Database>;

interface ConfirmationDependencies {
  createExpense: typeof createExpenseTransaction;
  createIncome: typeof createIncomeTransaction;
  createTransfer: typeof createTransferTransaction;
}

const defaultDependencies: ConfirmationDependencies = {
  createExpense: createExpenseTransaction,
  createIncome: createIncomeTransaction,
  createTransfer: createTransferTransaction,
};

const expenseWarnings: Record<string, string> = {
  budget_currency_mismatch: "支出已记录，但账户与预算币种不同，未计入预算。",
  budget_period_closed: "支出已记录，但对应预算月份已关闭，没有修改预算执行。",
  no_budget_bucket: "支出已记录，但没有可用预算分类，未计入预算。",
  no_budget_period: "支出已记录；该月预算尚未建立，建立后会按归属自动计入。",
};

const transferWarnings: Record<string, string> = {
  budget_currency_mismatch: "转账已记录，但账户与预算币种不同，未计入预算。",
  budget_not_applied: "转账已记录，但尚未计入预算，请检查该月预算配置。",
  budget_period_closed: "转账已记录，但对应预算月份已关闭，没有修改预算执行。",
  no_budget_allocation: "转账已记录，但该月没有对应预算额度，暂未计入预算。",
  no_budget_bucket: "转账已记录，但没有预算分类，未计入预算。",
  no_budget_period: "转账已记录；该月预算尚未建立，建立后会按归属自动计入。",
};

function invalid(message: string): AgentConfirmationResult {
  return { entryId: null, message, status: "error" };
}

function normalizedOccurredAt(value: string | null, now: Date): string | null {
  if (!value) return null;
  const normalized = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${normalized}+08:00`);
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)
    || !Number.isFinite(date.getTime()) || date > now || shanghaiDateTime(date) !== normalized) {
    return null;
  }
  return date.toISOString();
}

type CommonValidation =
  | { ok: false; error: string }
  | { ok: true; amount: number; description: string; occurredAt: string };

function commonValidation(draft: AgentTransactionDraft, now: Date): CommonValidation {
  const amountCents = draft.amount === null ? null : moneyToCents(String(draft.amount));
  if (amountCents === null || amountCents <= 0) return { error: "交易金额无效，请重新描述后生成预览。", ok: false };
  const occurredAt = normalizedOccurredAt(draft.occurredAt, now);
  if (!occurredAt) return { error: "交易时间无效或晚于当前时间，请重新生成预览。", ok: false };
  const description = draft.description?.trim() ?? "";
  if (!description || [...description].length > 1000) return { error: "交易描述无效，请重新生成预览。", ok: false };
  if (draft.memo && [...draft.memo].length > 1000) return { error: "交易备注过长，请重新生成预览。", ok: false };
  if (!draft.rawText.trim() || [...draft.rawText].length > 4000) return { error: "原始输入无效，请重新提交。", ok: false };
  return { amount: amountCents / 100, description, occurredAt, ok: true };
}

function expenseResult(result: CreateExpenseTransactionResult): AgentConfirmationResult {
  if (result.warningCode) {
    return {
      entryId: result.entryId,
      message: expenseWarnings[result.warningCode] ?? "支出已记录，但预算处理返回提示，请检查预算执行。",
      status: "warning",
    };
  }
  return { entryId: result.entryId, message: "支出已记录，财务数据已刷新。", status: "success" };
}

function incomeResult(result: CreateIncomeTransactionResult): AgentConfirmationResult {
  return {
    entryId: result.entryId,
    message: result.replayed ? "该收入已记录，财务数据已刷新。" : "收入已记录，财务数据已刷新。",
    status: "success",
  };
}

function transferResult(result: TransferResult): AgentConfirmationResult {
  if (result.warning_code) {
    return {
      entryId: result.entry_id,
      message: transferWarnings[result.warning_code] ?? "转账已记录，但预算处理返回提示，请检查预算执行。",
      status: "warning",
    };
  }
  return { entryId: result.entry_id, message: "转账已记录，财务数据已刷新。", status: "success" };
}

export async function confirmAgentTransaction(
  client: AgentMutationClient,
  draft: AgentTransactionDraft,
  options: AgentFinanceOptions,
  now = new Date(),
  dependencies: ConfirmationDependencies = defaultDependencies,
): Promise<AgentConfirmationResult> {
  const common = commonValidation(draft, now);
  if (!common.ok) return invalid(common.error);

  const accounts = new Map(options.accounts.map((account) => [account.id, account]));
  const buckets = new Map(options.budgetBuckets.map((bucket) => [bucket.id, bucket]));

  if (draft.type === "expense") {
    const account = draft.accountId ? accounts.get(draft.accountId) : null;
    if (!account) return invalid("所选账户已失效，请重新生成预览。");
    const category = draft.categoryId
      ? options.expenseCategories.find((item) => item.id === draft.categoryId)
      : null;
    if (!category) return invalid("所选支出分类已失效，请重新生成预览。");
    if (draft.excludeFromBudget && draft.budgetBucketId) return invalid("不计入预算的支出不能指定预算分类。");
    if (draft.budgetBucketId) {
      const bucket = buckets.get(draft.budgetBucketId);
      if (!bucket || bucket.kind !== "expense") return invalid("所选预算分类已失效，请重新生成预览。");
    }
    return expenseResult(await dependencies.createExpense(client, {
      accountId: account.id,
      amount: common.amount,
      budgetBucketId: draft.excludeFromBudget ? null : draft.budgetBucketId,
      categoryId: category.id,
      description: common.description,
      excludeFromBudget: draft.excludeFromBudget,
      memo: draft.memo,
      occurredAt: common.occurredAt,
      rawText: draft.rawText,
    }));
  }

  if (!draft.requestId || !reconciliationUuid.test(draft.requestId)) {
    return invalid("交易确认标识无效，请重新生成预览。");
  }

  if (draft.type === "income") {
    const account = draft.accountId ? accounts.get(draft.accountId) : null;
    if (!account || account.accountClass !== "asset") return invalid("收入账户已失效，请重新生成预览。");
    const category = draft.categoryId
      ? options.incomeCategories.find((item) => item.id === draft.categoryId)
      : null;
    if (!category) return invalid("收入分类已失效，请重新生成预览。");
    return incomeResult(await dependencies.createIncome(client, {
      accountId: account.id,
      amount: common.amount,
      categoryId: category.id,
      description: common.description,
      memo: draft.memo,
      occurredAt: common.occurredAt,
      rawText: draft.rawText,
      requestId: draft.requestId,
    }));
  }

  const from = draft.fromAccountId ? accounts.get(draft.fromAccountId) : null;
  const to = draft.toAccountId ? accounts.get(draft.toAccountId) : null;
  if (!from || from.accountClass !== "asset") return invalid("转出账户已失效，请重新生成预览。");
  if (!to) return invalid("转入账户已失效，请重新生成预览。");
  if (from.id === to.id) return invalid("转出和转入账户不能相同。");
  if (from.currency !== to.currency) return invalid("转账账户币种必须一致。");
  if (!draft.purpose) return invalid("转账用途无效，请重新生成预览。");
  if (draft.purpose === "debt" ? to.accountClass !== "liability" : to.accountClass !== "asset") {
    return invalid(draft.purpose === "debt" ? "还款必须转入负债账户。" : "转入账户必须是资产账户。");
  }
  if (draft.purpose === "general" && draft.budgetBucketId) return invalid("普通转账不能指定预算分类。");
  if (draft.budgetBucketId) {
    const bucket = buckets.get(draft.budgetBucketId);
    if (!bucket || bucket.kind !== draft.purpose) return invalid("预算分类与转账用途不匹配。");
  }
  return transferResult(await dependencies.createTransfer(client, {
    p_amount: common.amount,
    p_budget_bucket_id: draft.budgetBucketId,
    p_description: common.description,
    p_from_account_id: from.id,
    p_memo: draft.memo,
    p_occurred_at: common.occurredAt,
    p_purpose: draft.purpose,
    p_request_id: draft.requestId,
    p_to_account_id: to.id,
  }));
}
