export interface CategoryManagementActionState {
  status: "idle" | "error" | "uncertain" | "success";
  message: string | null;
  fieldErrors: Record<string, string>;
  categoryId?: string;
  updatedAt?: string;
  isActive?: boolean;
  replayed?: boolean;
}

export const initialCategoryManagementActionState: CategoryManagementActionState = {
  status: "idle", message: null, fieldErrors: {},
};
