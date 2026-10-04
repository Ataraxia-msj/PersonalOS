import { notFound } from "next/navigation";
import { getAffairsFormData } from "@/lib/affairs/service";
import { TaskForm } from "@/features/affairs/components/task-form";
import { submitAffairsAction } from "../../actions";
import {creationContext} from '@/lib/affairs/context';
export default async function Page({searchParams}:{searchParams:Promise<{projectId?:string}>}) {
  const data = await getAffairsFormData("task");
  if (!data || data.resource !== "task") notFound();
  const context=creationContext('task',(await searchParams).projectId,data.projects,data.mainlines);
  return <>{context.error?<p role="alert">{context.error}</p>:null}<TaskForm data={data} mode="create" action={submitAffairsAction} defaultProjectId={context.id}/></>;
}
