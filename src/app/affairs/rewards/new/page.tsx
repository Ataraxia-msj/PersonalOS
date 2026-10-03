import { notFound } from "next/navigation";
import { getAffairsFormData } from "@/lib/affairs/service";
import { RewardForm } from "@/features/affairs/components/reward-form";
import { submitAffairsAction } from "../../actions";
export default async function Page() {
  const data = await getAffairsFormData("reward");
  if (!data || data.resource !== "reward") notFound();
  return <RewardForm data={data} mode="create" action={submitAffairsAction} />;
}
