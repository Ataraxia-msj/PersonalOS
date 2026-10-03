import { notFound } from "next/navigation";
import { getAffairsFormData } from "@/lib/affairs/service";
import { TaskForm } from "@/features/affairs/components/task-form";
import { submitAffairsAction } from "../../actions";
export default async function Page() {
  const data = await getAffairsFormData("task");
  if (!data || data.resource !== "task") notFound();
  return <TaskForm data={data} mode="create" action={submitAffairsAction} />;
}
