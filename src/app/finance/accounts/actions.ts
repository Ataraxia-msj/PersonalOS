"use server";

import { revalidatePath } from "next/cache";

import type { AccountManagementActionState } from "@/lib/finance/account-management-action-state";
import {
  AccountManagementMutationError,
  createManagedAccount,
  setManagedAccountActive,
  updateManagedAccount,
} from "@/lib/finance/account-management-mutations";
import {
  validateCreateAccount,
  validateSetAccountActive,
  validateUpdateAccount,
} from "@/lib/finance/account-management-validation";
import { createClient } from "@/lib/supabase/server";

const errorMessages: Record<string, string> = {
  account_name_conflict: "已有同名账户，请使用其他名称。",
  account_not_found: "账户不存在或当前用户无权访问。",
  account_structure_locked: "账户已有余额或交易，不能修改资产/负债类别、账户类型或币种。",
  invalid_account_class_type: "账户类型与资产/负债类别不匹配。",
  invalid_account_currency: "币种格式无效，请使用三个大写字母。",
  invalid_account_id: "账户或请求标识无效，请重新打开页面。",
  invalid_account_name: "账户名称无效或过长。",
  invalid_account_sort_order: "排序必须是非负整数。",
  invalid_account_text: "机构或备注内容过长。",
  invalid_balance_time: "余额时间无效或晚于当前时间。",
  invalid_include_in_net_worth: "是否计入净资产的设置无效。",
  invalid_initial_balance: "当前余额必须非负、最多两位小数且不能超出范围。",
  request_payload_conflict: "该请求标识已用于不同内容，请重新打开新增账户页面。",
  stale_account: "账户已在其他页面发生变化，请刷新后重试。",
};

const idle = (): AccountManagementActionState => ({ fieldErrors: {}, message: null, status: "idle" });

async function authenticatedClient() {
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  return error || !data?.claims?.sub ? null : client;
}

function mutationFailure(error: unknown): AccountManagementActionState {
  if (error instanceof AccountManagementMutationError) {
    if (error.code === "PGRST202" || /(?:create|update|set)_account/.test(error.message) && /missing|schema cache/i.test(error.message)) {
      return { ...idle(), status: "error", message: "数据库账户管理功能尚未部署，请先执行 account management RPC migration。" };
    }
    const mapped = errorMessages[error.message];
    if (mapped) return { ...idle(), status: "error", message: mapped };
    if (error.code && /^[0-9A-Z]{5}$/.test(error.code)) {
      return { ...idle(), status: "error", message: "数据库未接受本次账户操作，请刷新后重试。" };
    }
  }
  return {
    ...idle(),
    status: "uncertain",
    message: "未能确认账户操作结果。请保留当前页面并重试同一次操作，系统会避免重复创建。",
  };
}

function validationFailure(fieldErrors: Record<string, string>): AccountManagementActionState {
  return { ...idle(), fieldErrors, message: "请检查表单中的内容。", status: "error" };
}

function refreshFinance(message: string): string {
  try {
    revalidatePath("/finance", "layout");
    return message;
  } catch {
    return `${message} 页面刷新失败，请手动刷新查看结果，不要重复更换请求标识。`;
  }
}

export async function createAccountAction(
  _previous: AccountManagementActionState,
  data: FormData,
): Promise<AccountManagementActionState> {
  const client = await authenticatedClient();
  if (!client) return { ...idle(), status: "error", message: "登录状态已失效，请重新登录。" };
  const validation = validateCreateAccount(data);
  if (!validation.input) return validationFailure(validation.errors);
  try {
    const result = await createManagedAccount(client, validation.input);
    const copy = result.replayed ? "该账户已存在，之前的创建操作已完成。" : "账户和初始余额已保存。";
    return {
      ...idle(),
      accountId: result.accountId,
      message: refreshFinance(copy),
      replayed: result.replayed,
      status: "success",
      updatedAt: result.updatedAt,
    };
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function updateAccountAction(
  _previous: AccountManagementActionState,
  data: FormData,
): Promise<AccountManagementActionState> {
  const client = await authenticatedClient();
  if (!client) return { ...idle(), status: "error", message: "登录状态已失效，请重新登录。" };
  const validation = validateUpdateAccount(data);
  if (!validation.input) return validationFailure(validation.errors);
  try {
    const result = await updateManagedAccount(client, validation.input);
    return {
      ...idle(), accountId: result.accountId, message: refreshFinance("账户信息已更新。"),
      status: "success", updatedAt: result.updatedAt,
    };
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function setAccountActiveAction(
  _previous: AccountManagementActionState,
  data: FormData,
): Promise<AccountManagementActionState> {
  const client = await authenticatedClient();
  if (!client) return { ...idle(), status: "error", message: "登录状态已失效，请重新登录。" };
  const validation = validateSetAccountActive(data);
  if (!validation.input) return validationFailure(validation.errors);
  try {
    const result = await setManagedAccountActive(client, validation.input);
    const copy = result.isActive ? "账户已重新启用。" : "账户已停用，历史交易和余额记录均保留。";
    return {
      ...idle(), accountId: result.accountId, isActive: result.isActive,
      message: refreshFinance(copy), status: "success", updatedAt: result.updatedAt,
    };
  } catch (error) {
    return mutationFailure(error);
  }
}
