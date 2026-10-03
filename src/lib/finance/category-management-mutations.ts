import type { SupabaseClient } from "@supabase/supabase-js";

import type { CategoryType, CreateCategoryArgs, Database, SetCategoryActiveArgs, UpdateCategoryArgs } from "./types";

export type CategoryMutationClient = SupabaseClient<Database>;
export interface CategoryMetadataInput {
  name: string; categoryType: CategoryType; defaultBudgetBucketId: string | null; sortOrder: number; note: string | null;
}
export interface CreateManagedCategoryInput extends CategoryMetadataInput { requestId: string }
export interface UpdateManagedCategoryInput extends CategoryMetadataInput { categoryId: string; expectedUpdatedAt: string }
export interface SetManagedCategoryActiveInput { categoryId: string; expectedUpdatedAt: string; isActive: boolean }

export class CategoryManagementMutationError extends Error {
  constructor(message: string, readonly code: string | null = null) { super(message); this.name = "CategoryManagementMutationError"; }
}
const failure = (error: { message: string; code?: string | null }) => new CategoryManagementMutationError(error.message, error.code ?? null);
const metadata = (input: CategoryMetadataInput) => ({
  p_category_type: input.categoryType, p_default_budget_bucket_id: input.defaultBudgetBucketId,
  p_name: input.name, p_note: input.note, p_sort_order: input.sortOrder,
});

export async function createManagedCategory(client: CategoryMutationClient, input: CreateManagedCategoryInput) {
  const args: CreateCategoryArgs = { ...metadata(input), p_request_id: input.requestId };
  const { data, error } = await client.rpc("create_category", args);
  if (error) throw failure(error);
  const row = data?.[0]; if (!row) throw new CategoryManagementMutationError("create_category returned no result");
  return { categoryId: row.category_id, updatedAt: row.category_updated_at, replayed: row.replayed };
}

export async function updateManagedCategory(client: CategoryMutationClient, input: UpdateManagedCategoryInput) {
  const args: UpdateCategoryArgs = { ...metadata(input), p_category_id: input.categoryId, p_expected_updated_at: input.expectedUpdatedAt };
  const { data, error } = await client.rpc("update_category", args);
  if (error) throw failure(error);
  const row = data?.[0]; if (!row) throw new CategoryManagementMutationError("update_category returned no result");
  return { categoryId: row.category_id, updatedAt: row.category_updated_at, typeLocked: row.type_locked };
}

export async function setManagedCategoryActive(client: CategoryMutationClient, input: SetManagedCategoryActiveInput) {
  const args: SetCategoryActiveArgs = { p_category_id: input.categoryId, p_expected_updated_at: input.expectedUpdatedAt, p_is_active: input.isActive };
  const { data, error } = await client.rpc("set_category_active", args);
  if (error) throw failure(error);
  const row = data?.[0]; if (!row) throw new CategoryManagementMutationError("set_category_active returned no result");
  return { categoryId: row.category_id, updatedAt: row.category_updated_at, isActive: row.is_active };
}
