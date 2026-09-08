import type { AccountBalanceView } from "./types";

export interface BalanceSnapshotRow {
  id: string;
  account_id: string;
  snapshot_at: string;
  balance: number;
  source: "manual" | "import" | "system";
  note: string | null;
  created_at: string;
  updated_at: string;
}
export interface ReconciliationInput {
  accountId: string;
  snapshotAt: string;
  balance: number;
  note: string | null;
}
export interface ReconciliationPreviewRow {
  account_id: string;
  snapshot_at: string;
  estimated_balance: number;
  latest_snapshot_id: string | null;
  has_later_snapshot: boolean;
  currency: string;
  account_class: "asset" | "liability";
}
export type ReconciliationSaveArgs = {
  p_request_id: string;
  p_account_id: string;
  p_snapshot_at: string;
  p_balance: number;
  p_note: string | null;
  p_expected_balance: number;
  p_expected_snapshot_id: string | null;
};
export interface ReconciliationResult {
  snapshot_id: string;
  account_id: string;
  snapshot_at: string;
  balance: number;
  replayed: boolean;
}
export interface ReconciliationPreview {
  input: ReconciliationInput;
  requestId: string;
  row: ReconciliationPreviewRow;
}
export interface ReconciliationActionState {
  status: "idle" | "preview" | "error" | "uncertain" | "success";
  message: string | null;
  errors: Record<string, string>;
  preview: ReconciliationPreview | null;
  result: ReconciliationResult | null;
}
export interface ReconciliationPageData {
  account: AccountBalanceView;
  snapshots: BalanceSnapshotRow[];
  defaultSnapshotAt: string;
}
