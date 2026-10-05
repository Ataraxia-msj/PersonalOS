import { notFound } from "next/navigation";
import { getAffairsFormData } from "@/lib/affairs/service";
import { TaskForm } from "@/features/affairs/components/task-form";
import { submitAffairsAction } from "../../actions";
import {creationContext,creationDate} from '@/lib/affairs/context';
export default async function Page({searchParams}:{searchParams:Promise<{projectId?:string;dueDate?:string|string[]}>}) {
  const data = await getAffairsFormData("task");
  if (!data || data.resource !== "task") notFound();
  const params=await searchParams;
  const context=creationContext('task',params.projectId,data.projects,data.mainlines);
  const date=creationDate(Array.isArray(params.dueDate)?'':params.dueDate);
  return <>{context.error?<p role="alert">{context.error}</p>:null}{date.error?<p role="alert">{date.error}</p>:null}<TaskForm data={data} mode="create" action={submitAffairsAction} defaultProjectId={context.id} defaultDueDate={date.date}/></>;
}
