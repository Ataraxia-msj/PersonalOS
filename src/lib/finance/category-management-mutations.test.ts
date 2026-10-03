import { describe, expect, it, vi } from "vitest";
import { createManagedCategory, setManagedCategoryActive, updateManagedCategory, type CategoryMutationClient } from "./category-management-mutations";

const base = { name: "餐饮", categoryType: "expense" as const, defaultBudgetBucketId: "bucket", sortOrder: 1, note: null };
describe("category management mutations", () => {
  it("maps create, update, and activation to exact RPCs", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ category_id: "c", category_updated_at: "v1", replayed: false }], error: null })
      .mockResolvedValueOnce({ data: [{ category_id: "c", category_updated_at: "v2", type_locked: true }], error: null })
      .mockResolvedValueOnce({ data: [{ category_id: "c", category_updated_at: "v3", is_active: false }], error: null });
    const client = { rpc } as unknown as CategoryMutationClient;
    await createManagedCategory(client, { ...base, requestId: "c" });
    await updateManagedCategory(client, { ...base, categoryId: "c", expectedUpdatedAt: "v1" });
    await setManagedCategoryActive(client, { categoryId: "c", expectedUpdatedAt: "v2", isActive: false });
    expect(rpc).toHaveBeenNthCalledWith(1, "create_category", { p_category_type: "expense", p_default_budget_bucket_id: "bucket", p_name: "餐饮", p_note: null, p_request_id: "c", p_sort_order: 1 });
    expect(rpc).toHaveBeenNthCalledWith(2, "update_category", expect.objectContaining({ p_category_id: "c", p_expected_updated_at: "v1" }));
    expect(rpc).toHaveBeenNthCalledWith(3, "set_category_active", { p_category_id: "c", p_expected_updated_at: "v2", p_is_active: false });
  });
});
