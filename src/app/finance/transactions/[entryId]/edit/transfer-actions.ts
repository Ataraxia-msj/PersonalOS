"use server";

import { revalidatePath } from "next/cache";

import { FinanceMutationError } from "@/lib/finance/mutations";
import { getAccountBalances, getBudgetBuckets } from "@/lib/finance/queries";
import { updateTransferTransaction } from "@/lib/finance/transfer-mutations";
import type { TransferActionState, TransferFormData } from "@/lib/finance/transfer-types";
import { validateTransferUpdateInput } from "@/lib/finance/transfer-validation";
import { createClient } from "@/lib/supabase/server";

const warnings: Record<string, string> = {
  no_budget_bucket: "转账已修改，但未选择预算分类，因此没有计入预算。",
  no_budget_period: "转账和预算归属已修改；建立该月预算后会自动计入。",
  budget_period_closed: "转账已修改，但新日期对应的预算已关闭，没有修改预算执行。",
  budget_period_closed_preserved: "转账已修改，但已关闭预算保持原记录不变。",
  no_budget_allocation: "转账和预算归属已修改，但该月没有对应预算额度，尚未计入预算。",
  budget_currency_mismatch: "转账已修改，但账户与预算币种不同，未计入预算。",
};
const errors: Record<string, string> = {
  account_inactive: "所选账户已停用，请重新选择。",
  account_not_found: "账户不存在或无权访问。",
  budget_bucket_kind_mismatch: "预算分类与转账用途不匹配。",
  budget_bucket_not_found_or_inactive: "所选预算分类不存在或已停用。",
  currency_mismatch: "转出和转入账户必须使用相同币种。",
  general_transfer_cannot_have_budget_bucket: "普通转账不能指定预算分类。",
  invalid_transfer_account_classes: "转出须为资产账户；还款转入负债账户，其余用途转入资产账户。",
  overlapping_budget_periods: "该日期匹配多个预算月份，修改未保存，请先检查预算配置。",
  transfer_budget_integrity_error: "原交易预算数据不一致，当前版本不能修改。",
  transfer_entry_has_multiple_budget_impacts: "这笔转账包含多条预算影响，当前版本不能修改。",
  transfer_entry_must_have_exactly_two_lines: "只有包含两条标准分录的转账可以修改。",
  transfer_entry_not_editable: "只有已确认、手动录入的转账可以修改。",
  transfer_entry_not_found: "未找到这笔转账，或当前用户无权访问。",
  transfer_entry_structure_invalid: "这笔转账使用历史或异常结构，当前版本不能修改。",
};
const failure = (message: string, status: "error" | "uncertain" = "error"): TransferActionState => ({
  status, message, errors: {}, result: null,
});

export async function updateTransferTransactionAction(data: FormData): Promise<TransferActionState> {
  let client;
  try {
    client = await createClient();
    const { data: claims, error } = await client.auth.getClaims();
    if (error || !claims?.claims?.sub) return failure("登录状态已失效，请重新登录后再保存。");
  } catch {
    return failure("暂时无法验证登录状态，请检查网络后重试。");
  }

  let options: TransferFormData;
  try {
    const [accounts, buckets] = await Promise.all([
      getAccountBalances(client), getBudgetBuckets(client),
    ]);
    options = {
      accounts: accounts.map((row) => ({ id: row.account_id, name: row.account_name,
        institution: row.institution, accountClass: row.account_class, currency: row.currency,
        balance: row.estimated_balance })),
      budgetBuckets: buckets.filter((row) => row.is_active && ["saving", "investment", "debt"].includes(row.bucket_kind))
        .map((row) => ({ id: row.id, name: row.name, kind: row.bucket_kind })),
    };
  } catch {
    return failure("无法读取真实账户或预算分类，本次修改尚未提交。");
  }
  const validated = validateTransferUpdateInput(data, options);
  if (!validated.args) return { ...failure("请检查表单内容。"), errors: validated.errors };

  let result;
  try {
    result = await updateTransferTransaction(client, validated.args);
  } catch (error) {
    if (error instanceof FinanceMutationError) {
      if (error.code === "PGRST202" || error.message.includes("update_transfer_transaction")) {
        return failure("数据库转账修改功能尚未部署，请执行 income/transfer editing migration。");
      }
      if (error.code === "P0001" || (error.code && /^(22|23|40|42|55|57)[0-9A-Z]{3}$/.test(error.code))) {
        return failure(errors[error.message] ?? "数据库未接受本次修改，请检查交易结构或参数。");
      }
    }
    return failure("尚未确认保存结果。请保留本页面，重试同一次修改。", "uncertain");
  }
  let message = result.warning_code
    ? warnings[result.warning_code] ?? "转账已修改，但预算处理返回未知提示，请核对预算执行。"
    : "转账已修改，财务数据已刷新。";
  try { revalidatePath("/finance", "layout"); }
  catch { message += " 页面刷新失败，请返回财务刷新查看，不要重复修改。"; }
  return { status: "success", errors: {}, result, message };
}
