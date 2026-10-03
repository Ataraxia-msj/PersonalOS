import { notFound } from "next/navigation";
import { getAffairsFormData } from "@/lib/affairs/service";
import { MainlineForm } from "@/features/affairs/components/mainline-form";
import { submitAffairsAction } from "../../actions";
export default async function Page() {
  const data = await getAffairsFormData("mainline");
  if (!data || data.resource !== "mainline") notFound();
  return (
    <MainlineForm data={data} mode="create" action={submitAffairsAction} />
  );
}
