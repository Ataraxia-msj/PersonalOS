"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveMonthlyBudget } from "@/lib/finance/budget-mutations";
import { validateBudgetForm } from "@/lib/finance/budget-validation";
import { FinanceMutationError } from "@/lib/finance/mutations";
import type { BudgetActionState } from "@/lib/finance/budget-action-state";

const messages: Record<string, string> = {
  overlapping_budget_periods: "该月份已有或重叠预算，请打开已有月份调整。",
  budget_version_conflict: "预算已被其他页面修改，请重新加载后确认。",
  budget_period_closed: "已关闭月份不可修改。",
  legacy_draft_requires_review: "旧草稿需要单独处理，暂时不能保存。",
  incomplete_budget_allocations: "预算分类配置已变化，请重新加载。",
  inactive_budget_bucket: "已停用的预算分类只能保留原金额。",
  budget_dates_immutable: "不能修改原预算的日期范围。",
  budget_bucket_not_found: "预算分类不存在，请重新加载。",
  unsupported_budget_currency: "当前仅支持人民币预算。",
};

export async function saveBudgetAction(_previous: BudgetActionState, data: FormData): Promise<BudgetActionState> {
  const client = await createClient();
  const { data: auth, error: authError } = await client.auth.getClaims();
  if (authError || !auth?.claims?.sub) return { status: "error", result: null, errors: {}, message: "登录状态已失效，请重新登录。" };
  const { errors, args } = validateBudgetForm(data);
  if (!args) return { status: "error", result: null, errors, message: "请检查预算金额和月份。" };
  let result;
  try {
    result = await saveMonthlyBudget(client, args);
  } catch (error) {
    let message = "保存结果未能确认，请先返回预算页面查看，再决定是否重试。";
    if (error instanceof FinanceMutationError) {
      message = messages[error.message] ?? message;
      if (error.code === "PGRST202") message = "预算保存功能尚未部署，请先执行预算归属迁移。";
      if (error.code === "55P03" || error.code === "40P01") message = "数据正在更新，本次未保存，请稍后重试。";
    }
    return { status: "error", result: null, errors: {}, message };
  }
  let message = `预算已保存，自动计入 ${result.backfilled_count} 笔消费。`;
  if (result.pending_transaction_count > 0) message += ` 尚有 ${result.pending_transaction_count} 笔归属待补充或需处理。`;
  if (result.warning_codes.includes("allocations_exceed_planned_income")) message += " 计划超过收入，需要动用结余。";
  try { revalidatePath("/finance", "layout"); }
  catch { message += " 页面刷新失败，请返回预算页重新查看，不要重复提交。"; }
  return { status: "success", result, errors: {}, message };
}
