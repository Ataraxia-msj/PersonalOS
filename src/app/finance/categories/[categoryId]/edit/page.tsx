import { notFound } from "next/navigation";
import { CategoryManagementForm } from "@/features/finance/components/category-management-form";
import { getCategoryEditData } from "@/lib/finance/category-management-service";
import { setCategoryActiveAction, updateCategoryAction } from "../../actions";

export default async function EditCategoryPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params; const data = await getCategoryEditData(categoryId); if (!data) notFound();
  return <CategoryManagementForm action={updateCategoryAction} activationAction={setCategoryActiveAction} buckets={data.buckets} initialValues={data.category} mode="edit" />;
}
