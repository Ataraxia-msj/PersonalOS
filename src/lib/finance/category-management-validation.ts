import type { CreateManagedCategoryInput, SetManagedCategoryActiveInput, UpdateManagedCategoryInput } from "./category-management-mutations";
import type { CategoryType } from "./types";
import { reconciliationUuid } from "./reconciliation-validation";

type Result<T> = { errors: Record<string, string>; input: T | null };
const value = (data: FormData, name: string) => { const raw = data.get(name); return typeof raw === "string" ? raw.trim() : ""; };

function metadata(data: FormData) {
  const errors: Record<string, string> = {};
  const name = value(data, "name"); if (!name || [...name].length > 200) errors.name = "分类名称需为 1–200 个字符。";
  const categoryType = value(data, "categoryType") as CategoryType;
  if (categoryType !== "expense" && categoryType !== "income") errors.categoryType = "请选择有效的分类类型。";
  const rawBucket = value(data, "defaultBudgetBucketId");
  const defaultBudgetBucketId = rawBucket || null;
  if (defaultBudgetBucketId && !reconciliationUuid.test(defaultBudgetBucketId)) errors.defaultBudgetBucketId = "默认预算分类无效。";
  if (categoryType === "income" && defaultBudgetBucketId) errors.defaultBudgetBucketId = "收入分类不能设置消费预算分类。";
  const rawSort = value(data, "sortOrder"); const sortOrder = Number(rawSort);
  if (!/^\d+$/.test(rawSort) || !Number.isSafeInteger(sortOrder) || sortOrder > 2147483647) {
    errors.sortOrder = "排序必须是 0–2147483647 的整数。";
  }
  const note = value(data, "note") || null; if (note && [...note].length > 1000) errors.note = "备注不能超过 1000 个字符。";
  return { errors, input: { name, categoryType, defaultBudgetBucketId, sortOrder, note } };
}

export function validateCreateCategory(data: FormData): Result<CreateManagedCategoryInput> {
  const base = metadata(data); const errors = { ...base.errors }; const requestId = value(data, "requestId").toLowerCase();
  if (!reconciliationUuid.test(requestId)) errors.requestId = "请重新打开新增分类页面。";
  return { errors, input: Object.keys(errors).length ? null : { ...base.input, requestId } };
}
export function validateUpdateCategory(data: FormData): Result<UpdateManagedCategoryInput> {
  const base = metadata(data); const errors = { ...base.errors }; const categoryId = value(data, "categoryId").toLowerCase();
  const expectedUpdatedAt = value(data, "expectedUpdatedAt");
  if (!reconciliationUuid.test(categoryId)) errors.categoryId = "分类标识无效。";
  if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) errors.expectedUpdatedAt = "分类版本无效，请刷新页面。";
  return { errors, input: Object.keys(errors).length ? null : { ...base.input, categoryId, expectedUpdatedAt } };
}
export function validateSetCategoryActive(data: FormData): Result<SetManagedCategoryActiveInput> {
  const errors: Record<string, string> = {}; const categoryId = value(data, "categoryId").toLowerCase();
  const expectedUpdatedAt = value(data, "expectedUpdatedAt"); const raw = value(data, "isActive");
  if (!reconciliationUuid.test(categoryId)) errors.categoryId = "分类标识无效。";
  if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) errors.expectedUpdatedAt = "分类版本无效，请刷新页面。";
  if (raw !== "true" && raw !== "false") errors.isActive = "分类状态无效。";
  return { errors, input: Object.keys(errors).length ? null : { categoryId, expectedUpdatedAt, isActive: raw === "true" } };
}
