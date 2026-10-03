import { notFound } from "next/navigation";
import { getAffairsFormData } from "@/lib/affairs/service";
import { MainlineForm } from "@/features/affairs/components/mainline-form";
import { submitAffairsAction } from "../../../actions";
export default async function Page({
  params,
}: {
  params: Promise<{ mainlineId: string }>;
}) {
  const { mainlineId } = await params;
  const data = await getAffairsFormData("mainline", mainlineId);
  if (!data || data.resource !== "mainline") notFound();
  return <MainlineForm data={data} mode="edit" action={submitAffairsAction} />;
}
