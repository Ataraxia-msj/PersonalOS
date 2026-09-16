"use server";

import { revalidatePath } from "next/cache";

import {
  createIncomeTransaction,
  IncomeMutationError,
} from "@/lib/finance/income-mutations";
import type { IncomeActionState } from "@/lib/finance/income-types";
import { validateIncomeInput } from "@/lib/finance/income-validation";
import { createClient } from "@/lib/supabase/server";

const mutationMessages: Record<string, string> = {
  account_inactive: "所选入账账户已停用。",
  account_not_found: "所选入账账户不存在。",
  income_account_must_be_asset: "收入只能进入资产账户。",
  income_category_not_found_or_inactive: "所选收入分类不存在或已停用。",
  invalid_income_amount: "金额必须大于 0、最多两位小数且不能超出范围。",
  invalid_income_description_or_memo: "描述或备注不符合要求。",
  invalid_income_id: "请求标识或必填项无效，请重新打开表单。",
  invalid_income_time: "请选择有效且不晚于当前的收入时间。",
  request_payload_conflict: "该请求标识已用于不同交易，请重新打开表单。",
};

export async function createIncomeAction(data: FormData): Promise<IncomeActionState> {
  const client = await createClient();
  const { data: claimsData, error: claimsError } = await client.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    return { errors: {}, message: "登录状态已失效，请重新登录后再提交。", result: null, status: "error" };
  }

  const validation = validateIncomeInput(data);
  if (!validation.input) {
    return {
      errors: validation.errors,
      message: "请检查表单中的必填内容。",
      result: null,
      status: "error",
    };
  }

  try {
    const result = await createIncomeTransaction(client, validation.input);
    revalidatePath("/finance", "layout");
    return {
      errors: {},
      message: result.replayed ? "该收入已记录，财务数据已刷新。" : "收入已记录，财务数据已刷新。",
      result,
      status: "success",
    };
  } catch (error) {
    const message = error instanceof IncomeMutationError
      ? error.code === "PGRST202" || error.message.includes("create_income_transaction")
        ? "数据库收入功能尚未部署，请先执行 income RPC migration。"
        : mutationMessages[error.message] ?? "收入提交失败，请稍后重试。"
      : "收入提交失败，请稍后重试。";
    return { errors: {}, message, result: null, status: "error" };
  }
}
