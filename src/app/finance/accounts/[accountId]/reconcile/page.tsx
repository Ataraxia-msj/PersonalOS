import { notFound } from "next/navigation";
import { ReconciliationForm } from "@/features/finance/components/reconciliation-form";
import { getReconciliationPageData } from "@/lib/finance/reconciliation-service";
import { previewReconciliationAction, saveReconciliationAction } from "./actions";

export default async function ReconciliationPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const data = await getReconciliationPageData(accountId);
  if (!data) notFound();
  return <ReconciliationForm key={accountId} data={data} previewAction={previewReconciliationAction} saveAction={saveReconciliationAction} />;
}
