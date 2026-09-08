"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FinanceMutationError } from "@/lib/finance/mutations";
import { createTransferTransaction } from "@/lib/finance/transfer-mutations";
import { validateTransferInput } from "@/lib/finance/transfer-validation";
import type { TransferActionState } from "@/lib/finance/transfer-types";

const warnings: Record<string, string> = {
  no_budget_bucket: "转账已记录，但未选择预算分类，未计入预算。当前版本不能补改转账归属。",
  no_budget_period: "转账和预算归属已保存，建立该月预算后会自动计入。",
  budget_period_closed: "转账已记录，但对应预算已关闭，没有修改预算执行。",
  no_budget_allocation: "转账和预算归属已保存，但该月没有对应预算额度配置，尚未计入预算。",
  budget_currency_mismatch: "转账已记录，但账户与预算币种不同，未计入预算。",
  budget_not_applied: "已确认原转账记录，但尚未计入预算。请检查该月预算配置，不要重复记账。",
};
const errors: Record<string, string> = {
  authentication_required: "登录状态已失效，请重新登录。",
  account_not_found: "账户不存在或无权访问。", account_inactive: "所选账户已停用，请重新选择。",
  invalid_transfer_account_classes: "转出须为资产账户；还款转入负债账户，其余用途转入资产账户。",
  currency_mismatch: "转出和转入账户必须使用相同币种。",
  budget_bucket_not_found_or_inactive: "所选预算分类不存在或已停用。",
  budget_bucket_kind_mismatch: "预算分类与转账用途不匹配。",
  general_transfer_cannot_have_budget_bucket: "普通转账不能指定预算分类。",
  overlapping_budget_periods: "该日期匹配多个预算月份，交易未保存，请先检查预算配置。",
  request_payload_conflict: "提交标识已被其他内容使用，请核对交易记录，不要重复记账。",
  transfer_budget_integrity_error: "原交易预算数据不一致，请先核对，未新增交易。",
  invalid_transfer_time: "交易时间无效或晚于服务器时间，请修正。",
};
const failure = (message: string, status: "error" | "uncertain" = "error"): TransferActionState => ({
  status, message, errors: {}, result: null,
});

export async function createTransferAction(data: FormData): Promise<TransferActionState> {
  let client;
  try {
    client = await createClient();
    const { data: claims, error } = await client.auth.getClaims();
    if (error || !claims?.claims?.sub) return failure("登录状态已失效，请重新登录后再提交。");
  } catch { return failure("暂时无法验证登录状态，请检查网络后重试。"); }
  const validated = validateTransferInput(data);
  if (!validated.args) return { ...failure("请检查表单内容。"), errors: validated.errors };
  let result;
  try { result = await createTransferTransaction(client, validated.args); }
  catch (error) {
    if (error instanceof FinanceMutationError) {
      if (error.code === "PGRST202") return failure("转账接口尚未部署，请先执行 202609080003_transfer_transactions.sql 迁移。");
      // SQLSTATE validation/constraint/permission/transaction errors guarantee RPC rollback.
      if (error.code && /^(22|23|40|42|55|57)[0-9A-Z]{3}$/.test(error.code)) {
        return failure(errors[error.message] ?? "数据库未接受本次转账，请检查参数或权限后重试。");
      }
    }
    return failure("尚未确认保存结果。请保留本页面，重试同一次转账，不要新建另一笔。", "uncertain");
  }
  let message = result.warning_code
    ? warnings[result.warning_code] ?? "转账已记录，但预算处理返回了未知提示，请核对预算执行。"
    : "转账已记录，财务数据已刷新；不计入收入或支出。";
  try { revalidatePath("/finance", "layout"); }
  catch { message += " 页面刷新失败，请返回财务刷新查看，不要重复提交。"; }
  return { status: "success", errors: {}, result, message };
}
