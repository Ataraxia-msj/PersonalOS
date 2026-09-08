import type { ExpenseAccountOption, ExpenseBudgetBucketOption } from "@/features/finance/types";

export type TransferPurpose = "general" | "saving" | "investment" | "debt";
export const transferLabels: Record<TransferPurpose, string> = {
  general: "普通转账", saving: "储蓄", investment: "投资", debt: "还款",
};
export type TransferArgs = {
  p_request_id: string;
  p_occurred_at: string;
  p_description: string;
  p_from_account_id: string;
  p_to_account_id: string;
  p_amount: number;
  p_purpose: TransferPurpose;
  p_budget_bucket_id: string | null;
  p_memo: string | null;
};
export interface TransferResult {
  entry_id: string;
  from_line_id: string;
  to_line_id: string;
  budget_impact_created: boolean;
  budget_period_id: string | null;
  budget_bucket_id: string | null;
  warning_code: string | null;
  replayed: boolean;
}
export interface TransferActionState {
  status: "error" | "uncertain" | "success";
  message: string;
  errors: Record<string, string>;
  result: TransferResult | null;
}
export interface TransferFormData {
  accounts: ExpenseAccountOption[];
  budgetBuckets: ExpenseBudgetBucketOption[];
}
