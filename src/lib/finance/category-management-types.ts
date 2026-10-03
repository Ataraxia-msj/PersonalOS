import type { BudgetBucketRow, CategoryType, ExpenseCategoryRow } from "./types";

export interface ManagedCategory {
  id: string;
  name: string;
  categoryType: CategoryType;
  defaultBudgetBucketId: string | null;
  defaultBudgetBucketName: string | null;
  isActive: boolean;
  sortOrder: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryEditData extends ManagedCategory {
  typeLocked: boolean;
}

export type ExpenseBudgetBucketOption = Pick<BudgetBucketRow, "id" | "name" | "sort_order">;
export type CategoryRow = ExpenseCategoryRow;
