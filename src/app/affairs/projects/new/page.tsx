import { notFound } from "next/navigation";
import { getAffairsFormData } from "@/lib/affairs/service";
import { ProjectForm } from "@/features/affairs/components/project-form";
import { submitAffairsAction } from "../../actions";
export default async function Page() {
  const data = await getAffairsFormData("project");
  if (!data || data.resource !== "project") notFound();
  return <ProjectForm data={data} mode="create" action={submitAffairsAction} />;
}
