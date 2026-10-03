import { getAffairsCoinsData } from "@/lib/affairs/service";
import { CoinLedger } from "@/features/affairs/components/coin-ledger";
import { submitAffairsAction } from "../actions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; event?: string }>;
}) {
  const { before, event } = await searchParams;
  return (
    <CoinLedger
      data={await getAffairsCoinsData(before, event)}
      action={submitAffairsAction}
    />
  );
}
