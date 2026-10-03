import { createCategoryAction } from "../actions";
import { CategoryManagementForm } from "@/features/finance/components/category-management-form";
import { getCategoryManagementPageData } from "@/lib/finance/category-management-service";

export default async function NewCategoryPage() {
  const { buckets } = await getCategoryManagementPageData();
  return <CategoryManagementForm action={createCategoryAction} buckets={buckets} mode="create" />;
}
