import { describe, expect, it } from "vitest";
import { validateCreateCategory, validateSetCategoryActive, validateUpdateCategory } from "./category-management-validation";

const requestId = "a1000000-0000-0000-0000-000000000001";
const bucketId = "b1000000-0000-0000-0000-000000000001";
function valid() { const data = new FormData(); Object.entries({ requestId, name: " 餐饮 ", categoryType: "expense", defaultBudgetBucketId: bucketId, sortOrder: "2", note: " 日常 " }).forEach(([key, value]) => data.set(key, value)); return data; }

describe("category management validation", () => {
  it("normalizes create category metadata", () => {
    expect(validateCreateCategory(valid())).toEqual({ errors: {}, input: { requestId, name: "餐饮", categoryType: "expense", defaultBudgetBucketId: bucketId, sortOrder: 2, note: "日常" } });
  });
  it("requires income categories to omit budget buckets", () => {
    const data = valid(); data.set("categoryType", "income");
    expect(validateCreateCategory(data).errors.defaultBudgetBucketId).toBeDefined();
    data.set("defaultBudgetBucketId", "");
    expect(validateCreateCategory(data).input).toMatchObject({ categoryType: "income", defaultBudgetBucketId: null });
  });
  it("validates update and activation versions", () => {
    const data = valid(); data.set("categoryId", requestId); data.set("expectedUpdatedAt", "2026-10-03T00:00:00Z");
    expect(validateUpdateCategory(data).input).toMatchObject({ categoryId: requestId, expectedUpdatedAt: "2026-10-03T00:00:00Z" });
    const status = new FormData(); status.set("categoryId", requestId); status.set("expectedUpdatedAt", "2026-10-03T00:00:00Z"); status.set("isActive", "false");
    expect(validateSetCategoryActive(status).input).toEqual({ categoryId: requestId, expectedUpdatedAt: "2026-10-03T00:00:00Z", isActive: false });
  });
});
