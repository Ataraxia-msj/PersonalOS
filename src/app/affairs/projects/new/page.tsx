import { notFound } from "next/navigation";
import { getAffairsFormData } from "@/lib/affairs/service";
import { ProjectForm } from "@/features/affairs/components/project-form";
import { submitAffairsAction } from "../../actions";
import {creationContext} from '@/lib/affairs/context';
export default async function Page({searchParams}:{searchParams:Promise<{mainlineId?:string}>}) {
  const data = await getAffairsFormData("project");
  if (!data || data.resource !== "project") notFound();
  const context=creationContext('project',(await searchParams).mainlineId,data.projects,data.mainlines);
  return <>{context.error?<p role="alert">{context.error}</p>:null}<ProjectForm data={data} mode="create" action={submitAffairsAction} defaultMainlineId={context.id}/></>;
}
