import { createClient } from "@/lib/supabase/server";

import { adaptCategoryEditData, adaptManagedCategories } from "./category-management-adapters";
import { categoryHasJournalLines, getExpenseBudgetBuckets, getManagedCategoryRows } from "./category-management-queries";

export async function getCategoryManagementPageData() {
  const client = await createClient();
  const [rows, allBuckets] = await Promise.all([getManagedCategoryRows(client), getExpenseBudgetBuckets(client)]);
  return {
    categories: adaptManagedCategories(rows, allBuckets),
    buckets: allBuckets.filter((bucket) => bucket.is_active),
  };
}

export async function getCategoryEditData(categoryId: string) {
  const client = await createClient();
  const [rows, allBuckets] = await Promise.all([getManagedCategoryRows(client), getExpenseBudgetBuckets(client)]);
  const category = adaptManagedCategories(rows, allBuckets).find((candidate) => candidate.id === categoryId);
  if (!category) return null;
  return {
    category: adaptCategoryEditData(category, await categoryHasJournalLines(client, categoryId)),
    buckets: allBuckets.filter((bucket) => bucket.is_active),
  };
}
