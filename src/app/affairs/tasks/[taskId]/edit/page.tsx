import { notFound } from "next/navigation";
import { getAffairsFormData } from "@/lib/affairs/service";
import { TaskForm } from "@/features/affairs/components/task-form";
import { submitAffairsAction } from "../../../actions";
export default async function Page({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const data = await getAffairsFormData("task", taskId);
  if (!data || data.resource !== "task") notFound();
  return <TaskForm data={data} mode="edit" action={submitAffairsAction} />;
}
