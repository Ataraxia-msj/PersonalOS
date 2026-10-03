"use server";

import { revalidatePath } from "next/cache";
import type { CategoryManagementActionState } from "@/lib/finance/category-management-action-state";
import { CategoryManagementMutationError, createManagedCategory, setManagedCategoryActive, updateManagedCategory } from "@/lib/finance/category-management-mutations";
import { validateCreateCategory, validateSetCategoryActive, validateUpdateCategory } from "@/lib/finance/category-management-validation";
import { createClient } from "@/lib/supabase/server";

const idle = (): CategoryManagementActionState => ({ status: "idle", message: null, fieldErrors: {} });
const messages: Record<string, string> = {
  category_name_conflict: "同类型中已有这个分类名称。", category_not_found: "分类不存在。",
  category_type_locked: "该分类已有交易，不能修改支出/收入类型。", invalid_category_name: "分类名称无效或过长。",
  invalid_category_type: "分类类型无效。", invalid_category_sort_order: "排序必须是非负整数。",
  invalid_category_note: "备注内容过长。", invalid_default_budget_bucket: "默认预算分类不存在、已停用或不是消费预算。",
  income_category_budget_bucket_forbidden: "收入分类不能设置消费预算分类。", request_payload_conflict: "该创建请求已用于不同内容，请重新打开页面。",
  stale_category: "分类已在其他页面发生变化，请刷新后重试。",
};
async function authenticatedClient() { const client = await createClient(); const { data, error } = await client.auth.getClaims(); return error || !data?.claims?.sub ? null : client; }
function fail(error: unknown, replaySafe: boolean): CategoryManagementActionState {
  if (error instanceof CategoryManagementMutationError) {
    if (error.code === "PGRST202" || /category/.test(error.message) && /missing|schema cache/i.test(error.message)) return { ...idle(), status: "error", message: "数据库分类管理功能尚未部署，请先执行 category management RPC migration。" };
    if (messages[error.message]) return { ...idle(), status: "error", message: messages[error.message] };
  }
  return { ...idle(), status: "uncertain", message: replaySafe ? "未能确认创建结果，请保留页面并重试同一次创建。" : "未能确认操作结果，请刷新分类页面核对，不要立即重复提交。" };
}
function refresh(message: string) { try { revalidatePath("/finance", "layout"); return message; } catch { return `${message} 请手动刷新查看结果。`; } }
const invalid = (fieldErrors: Record<string, string>): CategoryManagementActionState => ({ ...idle(), status: "error", message: "请检查表单内容。", fieldErrors });

export async function createCategoryAction(_: CategoryManagementActionState, form: FormData): Promise<CategoryManagementActionState> {
  const client = await authenticatedClient(); if (!client) return { ...idle(), status: "error", message: "登录状态已失效，请重新登录。" };
  const parsed = validateCreateCategory(form); if (!parsed.input) return invalid(parsed.errors);
  try { const result = await createManagedCategory(client, parsed.input); return { ...idle(), status: "success", categoryId: result.categoryId, updatedAt: result.updatedAt, replayed: result.replayed, message: refresh(result.replayed ? "该分类之前已经创建成功。" : "分类已创建。") }; } catch (error) { return fail(error, true); }
}
export async function updateCategoryAction(_: CategoryManagementActionState, form: FormData): Promise<CategoryManagementActionState> {
  const client = await authenticatedClient(); if (!client) return { ...idle(), status: "error", message: "登录状态已失效，请重新登录。" };
  const parsed = validateUpdateCategory(form); if (!parsed.input) return invalid(parsed.errors);
  try { const result = await updateManagedCategory(client, parsed.input); return { ...idle(), status: "success", categoryId: result.categoryId, updatedAt: result.updatedAt, message: refresh("分类已更新。") }; } catch (error) { return fail(error, false); }
}
export async function setCategoryActiveAction(_: CategoryManagementActionState, form: FormData): Promise<CategoryManagementActionState> {
  const client = await authenticatedClient(); if (!client) return { ...idle(), status: "error", message: "登录状态已失效，请重新登录。" };
  const parsed = validateSetCategoryActive(form); if (!parsed.input) return invalid(parsed.errors);
  try { const result = await setManagedCategoryActive(client, parsed.input); return { ...idle(), status: "success", categoryId: result.categoryId, updatedAt: result.updatedAt, isActive: result.isActive, message: refresh(result.isActive ? "分类已重新启用。" : "分类已停用，历史交易保持不变。") }; } catch (error) { return fail(error, false); }
}
