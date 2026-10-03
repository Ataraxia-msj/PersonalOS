import { notFound } from "next/navigation";
import { getAffairsProjectDetailData } from "@/lib/affairs/service";
import { ProjectDetail } from "@/features/affairs/components/project-detail";
import { submitAffairsAction } from "../../actions";
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const data = await getAffairsProjectDetailData(projectId);
  if (!data) notFound();
  return <ProjectDetail data={data} action={submitAffairsAction} />;
}
