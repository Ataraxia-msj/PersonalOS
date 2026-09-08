"use server";

import { revalidatePath } from "next/cache";

import type { ExpenseTransactionActionState } from "@/lib/finance/action-state";
import {
  createExpenseTransaction,
  FinanceMutationError,
} from "@/lib/finance/mutations";
import type { ExpenseBudgetWarningCode } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const amountPattern = /^\d+(?:\.\d{1,2})?$/;

const warningMessages: Record<ExpenseBudgetWarningCode, string> = {
  budget_currency_mismatch: "交易和预算分类已保存，但账户与预算币种不一致，未计入预算。",
  budget_period_closed: "交易已记录，但对应预算月份已关闭，因此没有修改预算执行。",
  budget_period_closed_preserved: "交易已修改，但已关闭预算保持原记录不变。",
  no_budget_bucket: "交易已记录，但分类没有可用预算分类，因此没有计入预算。",
  no_budget_period: "交易已记录，但该日期没有对应预算月份。",
};

const mutationErrorMessages: Record<string, string> = {
  account_not_found_or_inactive: "所选账户不存在或已停用。",
  amount_must_be_positive: "金额必须大于 0。",
  amount_must_have_at_most_two_decimal_places: "金额最多保留两位小数。",
  amount_out_of_range: "金额超出可记录范围。",
  budget_bucket_not_allocated_to_period: "所选预算分类未配置到该预算月份。",
  budget_bucket_not_found_or_inactive: "所选预算分类不存在或已停用。",
  category_default_bucket_not_allocated_to_period: "该分类的默认预算分类未配置到对应月份。",
  category_default_budget_bucket_not_found_or_inactive: "该分类的默认预算分类不存在或已停用。",
  expense_category_not_found_or_inactive: "所选支出分类不存在或已停用。",
  overlapping_budget_periods: "该日期匹配到多个预算月份，请先修复预算配置。",
};

function valueOf(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validateForm(formData: FormData) {
  const occurredAt = valueOf(formData, "occurredAt");
  const amountText = valueOf(formData, "amount");
  const accountId = valueOf(formData, "accountId");
  const categoryId = valueOf(formData, "categoryId");
  const budgetBucketId = valueOf(formData, "budgetBucketId");
  const description = valueOf(formData, "description");
  const excludeFromBudget = valueOf(formData, "excludeFromBudget") === "on";
  const fieldErrors: ExpenseTransactionActionState["fieldErrors"] = {};

  if (!localDateTimePattern.test(occurredAt)) {
    fieldErrors.occurredAt = "请选择有效的日期和时间。";
  }
  if (!amountPattern.test(amountText) || Number(amountText) <= 0) {
    fieldErrors.amount = "请输入大于 0、最多两位小数的金额。";
  }
  if (!uuidPattern.test(accountId)) {
    fieldErrors.accountId = "请选择有效账户。";
  }
  if (!uuidPattern.test(categoryId)) {
    fieldErrors.categoryId = "请选择有效分类。";
  }
  if (budgetBucketId && !uuidPattern.test(budgetBucketId)) {
    fieldErrors.budgetBucketId = "请选择有效预算分类。";
  }
  if (!description) {
    fieldErrors.description = "请输入描述。";
  }

  return {
    fieldErrors,
    input: {
      accountId,
      amount: Number(amountText),
      budgetBucketId: excludeFromBudget ? null : budgetBucketId || null,
      categoryId,
      description,
      excludeFromBudget,
      memo: null,
      occurredAt: localDateTimePattern.test(occurredAt)
        ? `${occurredAt}:00+08:00`
        : occurredAt,
      rawText: null,
    },
  };
}

function mutationMessage(error: FinanceMutationError) {
  if (error.code === "PGRST202" || error.message.includes("create_expense_transaction")) {
    return "数据库写入功能尚未部署，请先执行 expense RPC migration。";
  }
  return mutationErrorMessages[error.message] ?? "交易提交失败，请稍后重试。";
}

export async function createExpenseTransactionAction(
  _previousState: ExpenseTransactionActionState,
  formData: FormData,
): Promise<ExpenseTransactionActionState> {
  const client = await createClient();
  const { data: claimsData, error: claimsError } = await client.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    return {
      entryId: null,
      fieldErrors: {},
      message: "登录状态已失效，请重新登录后再提交。",
      status: "error",
    };
  }

  const { fieldErrors, input } = validateForm(formData);
  if (Object.keys(fieldErrors).length > 0) {
    return {
      entryId: null,
      fieldErrors,
      message: "请检查表单中的必填内容。",
      status: "error",
    };
  }

  try {
    const result = await createExpenseTransaction(client, input);
    revalidatePath("/finance", "layout");

    if (result.warningCode) {
      return {
        entryId: result.entryId,
        fieldErrors: {},
        message: result.warningCode === "no_budget_period" && result.budgetBucketId
          ? "交易和预算归属已保存，建立该月预算后自动计入。"
          : warningMessages[result.warningCode],
        status: "warning",
      };
    }

    return {
      entryId: result.entryId,
      fieldErrors: {},
      message: "支出已记录，财务数据已刷新。",
      status: "success",
    };
  } catch (error) {
    return {
      entryId: null,
      fieldErrors: {},
      message: error instanceof FinanceMutationError
        ? mutationMessage(error)
        : "交易提交失败，请稍后重试。",
      status: "error",
    };
  }
}
