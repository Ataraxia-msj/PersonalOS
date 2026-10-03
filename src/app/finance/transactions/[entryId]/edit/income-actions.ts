"use server";

import { revalidatePath } from "next/cache";

import { IncomeMutationError, updateIncomeTransaction } from "@/lib/finance/income-mutations";
import type { IncomeActionState } from "@/lib/finance/income-types";
import { validateIncomeUpdateInput } from "@/lib/finance/income-validation";
import { createClient } from "@/lib/supabase/server";

const mutationMessages: Record<string, string> = {
  account_inactive: "所选入账账户已停用。",
  account_not_found: "所选入账账户不存在。",
  income_account_must_be_asset: "收入只能进入资产账户。",
  income_category_not_found_or_inactive: "所选收入分类不存在或已停用。",
  income_entry_has_budget_impact: "这笔收入包含预算影响，当前版本不能修改。",
  income_entry_must_have_exactly_one_line: "只有包含一条分录的普通收入可以修改。",
  income_entry_not_editable: "只有已确认、手动录入的普通收入可以修改。",
  income_entry_not_found: "未找到这笔收入，或当前用户无权访问。",
  income_entry_structure_invalid: "这笔收入使用历史或异常结构，当前版本不能修改。",
  invalid_income_amount: "金额必须大于 0、最多两位小数且不能超出范围。",
  invalid_income_description_or_memo: "描述或备注不符合要求。",
  invalid_income_id: "交易标识或必填项无效。",
  invalid_income_time: "请选择有效且不晚于当前的收入时间。",
};

export async function updateIncomeTransactionAction(data: FormData): Promise<IncomeActionState> {
  const client = await createClient();
  const { data: claimsData, error: claimsError } = await client.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    return { errors: {}, message: "登录状态已失效，请重新登录后再保存。", result: null, status: "error" };
  }
  const validation = validateIncomeUpdateInput(data);
  if (!validation.input) {
    return { errors: validation.errors, message: "请检查表单中的必填内容。", result: null, status: "error" };
  }
  try {
    const result = await updateIncomeTransaction(client, validation.input);
    revalidatePath("/finance", "layout");
    return { errors: {}, message: "收入已修改，财务数据已刷新。", result, status: "success" };
  } catch (error) {
    const message = error instanceof IncomeMutationError
      ? error.code === "PGRST202" || error.message.includes("update_income_transaction")
        ? "数据库收入修改功能尚未部署，请执行 income/transfer editing migration。"
        : mutationMessages[error.message] ?? "收入修改失败，请稍后重试。"
      : "收入修改失败，请稍后重试。";
    return { errors: {}, message, result: null, status: "error" };
  }
}
