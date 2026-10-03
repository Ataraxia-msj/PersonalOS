import type { CategoryEditData, ManagedCategory } from "./category-management-types";
import type { BudgetBucketRow, ExpenseCategoryRow } from "./types";

export function adaptManagedCategories(rows: ExpenseCategoryRow[], buckets: BudgetBucketRow[]): ManagedCategory[] {
  const names = new Map(buckets.map((bucket) => [bucket.id, bucket.name]));
  return rows.map((row) => ({
    id: row.id, name: row.name, categoryType: row.category_type,
    defaultBudgetBucketId: row.default_budget_bucket_id,
    defaultBudgetBucketName: row.default_budget_bucket_id ? names.get(row.default_budget_bucket_id) ?? null : null,
    isActive: row.is_active, sortOrder: row.sort_order, note: row.note,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

export function adaptCategoryEditData(category: ManagedCategory, typeLocked: boolean): CategoryEditData {
  return { ...category, typeLocked };
}
