import { getAffairsShopData } from "@/lib/affairs/service";
import { RewardShop } from "@/features/affairs/components/reward-shop";
import { submitAffairsAction } from "../actions";
export default async function Page() {
  return (
    <RewardShop
      data={await getAffairsShopData()}
      action={submitAffairsAction}
    />
  );
}
