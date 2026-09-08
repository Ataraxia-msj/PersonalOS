import { createClient } from "@/lib/supabase/server";
import { getBalanceSnapshotHistory, getReconciliationAccount } from "./reconciliation-queries";
import { reconciliationUuid, shanghaiDateTime } from "./reconciliation-validation";
import type { ReconciliationPageData } from "./reconciliation-types";

export async function getReconciliationPageData(accountId: string): Promise<ReconciliationPageData | null> {
  if (!reconciliationUuid.test(accountId)) return null;
  const client = await createClient();
  const [account, snapshots] = await Promise.all([
    getReconciliationAccount(client, accountId), getBalanceSnapshotHistory(client, accountId),
  ]);
  if (!account) return null;
  return { account, snapshots, defaultSnapshotAt: shanghaiDateTime(new Date()) };
}
