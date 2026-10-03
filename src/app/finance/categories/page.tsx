import { CategoryList } from "@/features/finance/components/category-list";
import { getCategoryManagementPageData } from "@/lib/finance/category-management-service";

export default async function CategoriesPage() {
  const { categories } = await getCategoryManagementPageData();
  return <CategoryList categories={categories} />;
}
