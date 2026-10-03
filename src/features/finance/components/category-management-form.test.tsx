import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CategoryEditData, ManagedCategory } from "@/lib/finance/category-management-types";
import { CategoryList } from "./category-list";
import { CategoryManagementForm } from "./category-management-form";

const base: ManagedCategory = { id: "a1000000-0000-0000-0000-000000000001", name: "餐饮", categoryType: "expense", defaultBudgetBucketId: "b1000000-0000-0000-0000-000000000001", defaultBudgetBucketName: "变动必要开销", isActive: true, sortOrder: 1, note: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
const buckets = [{ id: "b1000000-0000-0000-0000-000000000001", name: "变动必要开销", sort_order: 1 }];
describe("category management UI", () => {
  it("groups categories and reveals inactive records", async () => {
    render(<CategoryList categories={[base, { ...base, id: "inactive", name: "旧分类", isActive: false }]} />);
    expect(screen.getByText("支出分类")).toBeInTheDocument(); expect(screen.getByText("餐饮")).toBeInTheDocument(); expect(screen.queryByText("旧分类")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /显示已停用分类/ })); expect(screen.getByText("旧分类")).toBeInTheDocument();
  });
  it("removes budget selection when switching to income", async () => {
    render(<CategoryManagementForm action={vi.fn()} buckets={buckets} mode="create" />);
    expect(screen.getByLabelText("默认预算分类（可选）")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("分类类型"), "income");
    expect(screen.queryByLabelText("默认预算分类（可选）")).not.toBeInTheDocument();
  });
  it("locks a used type and carries the newest edit version into activation", async () => {
    const initial: CategoryEditData = { ...base, typeLocked: true };
    const action = vi.fn().mockResolvedValue({ status: "success", message: "已更新", fieldErrors: {}, updatedAt: "v2" });
    const activation = vi.fn().mockResolvedValue({ status: "success", message: "已停用", fieldErrors: {}, updatedAt: "v3", isActive: false });
    render(<CategoryManagementForm action={action} activationAction={activation} buckets={buckets} initialValues={initial} mode="edit" />);
    expect(screen.getByLabelText("分类类型")).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "保存修改" })); await waitFor(() => expect(action).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole("button", { name: "停用分类" })); await waitFor(() => expect(activation).toHaveBeenCalledOnce());
    expect((activation.mock.calls[0][1] as FormData).get("expectedUpdatedAt")).toBe("v2");
  });
});
