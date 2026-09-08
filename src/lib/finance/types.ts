import type { BalanceSnapshotRow, ReconciliationPreviewRow, ReconciliationResult, ReconciliationSaveArgs } from "./reconciliation-types";
import type { TransferArgs, TransferPurpose, TransferResult } from "./transfer-types";

export type AccountClass = "asset" | "liability";

export type AccountType =
  | "cash"
  | "bank"
  | "ewallet"
  | "wallet_pocket"
  | "money_market"
  | "time_deposit"
  | "investment"
  | "receivable"
  | "credit_card"
  | "consumer_credit"
  | "loan"
  | "payable"
  | "other";

export type BalanceSource = "ledger_only" | "snapshot" | "snapshot_plus_ledger";
export type BudgetPeriodStatus = "draft" | "active" | "closed";
export type BudgetBucketKind = "expense" | "saving" | "investment" | "debt" | "other";
export type TransactionEntryType = "expense" | "income" | "transfer" | "refund" | "adjustment";
export type TransactionSource = "manual" | "ai" | "import" | "reconcile";
export type TransactionStatus = "draft" | "confirmed" | "void";

export interface NetWorthView {
  currency: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
}

export interface AccountBalanceView {
  account_id: string;
  account_name: string;
  account_class: AccountClass;
  account_type: AccountType;
  currency: string;
  institution: string | null;
  include_in_net_worth: boolean;
  is_active: boolean;
  sort_order: number;
  latest_snapshot_at: string | null;
  latest_snapshot_balance: number | null;
  ledger_change_after_snapshot: number;
  estimated_balance: number;
  balance_source: BalanceSource;
}

export interface BudgetExecutionView {
  budget_period_id: string;
  start_date: string;
  end_date: string;
  period_status: BudgetPeriodStatus;
  currency: string;
  planned_income: number;
  budget_bucket_id: string;
  budget_bucket_name: string;
  bucket_kind: BudgetBucketKind;
  sort_order: number;
  planned_amount: number;
  actual_amount: number;
  remaining_amount: number;
  execution_rate: number | null;
}

export interface MonthlyFinancialSummaryView {
  budget_period_id: string;
  start_date: string;
  end_date: string;
  status: BudgetPeriodStatus;
  currency: string;
  summary_as_of: string;
  planned_income: number;
  actual_income: number;
  planned_total_allocated: number;
  planned_unallocated: number;
  planned_expense: number;
  planned_saving: number;
  planned_investment: number;
  planned_debt: number;
  actual_expense: number;
  actual_saving: number;
  actual_total_expense: number;
  actual_investment: number;
  actual_debt: number;
  actual_unallocated: number;
  expense_variance: number;
  saving_rate: number | null;
  net_worth_start: number | null;
  net_worth_as_of: number | null;
  net_worth_change: number | null;
  missing_start_snapshots: number;
  missing_current_snapshots: number;
}

export interface TransactionDetailView {
  // Absent only on pre-migration deployments; never infer a legacy transfer's purpose.
  transfer_purpose?: TransferPurpose | null;
  saved_budget_bucket_id: string | null;
  saved_budget_bucket_name: string | null;
  entry_id: string;
  occurred_at: string;
  entry_type: TransactionEntryType;
  description: string;
  source: TransactionSource;
  status: TransactionStatus;
  related_entry_id: string | null;
  line_id: string;
  line_sort_order: number;
  amount: number;
  memo: string | null;
  account_id: string;
  account_name: string;
  account_class: AccountClass;
  account_type: AccountType;
  institution: string | null;
  category_id: string | null;
  category_name: string | null;
  category_type: "expense" | "income" | null;
  exclude_from_budget: boolean;
  budget_period_id: string | null;
  budget_period_start_date: string | null;
  budget_period_end_date: string | null;
  budget_bucket_id: string | null;
  budget_bucket_name: string | null;
}

export interface JournalEntryRow {
  transfer_purpose?: TransferPurpose | null;
  id: string;
  occurred_at: string;
  entry_type: TransactionEntryType;
  description: string;
  source: TransactionSource;
  raw_text: string | null;
  status: TransactionStatus;
  related_entry_id: string | null;
  note: string | null;
  exclude_from_budget: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetImpactRow {
  id: string;
  entry_id: string;
  line_id: string | null;
  budget_period_id: string;
  budget_bucket_id: string;
  amount: number;
  source: "auto" | "ai" | "manual" | "import";
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  category_type: "expense" | "income";
  parent_id: string | null;
  default_budget_bucket_id: string | null;
  is_active: boolean;
  sort_order: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseBudgetWarningCode =
  | "no_budget_period"
  | "no_budget_bucket"
  | "budget_period_closed"
  | "budget_currency_mismatch"
  | "budget_period_closed_preserved";

export type CreateExpenseTransactionArgs = {
  p_occurred_at: string;
  p_description: string;
  p_account_id: string;
  p_amount: number;
  p_category_id: string;
  p_budget_bucket_id: string | null;
  p_raw_text: string | null;
  p_memo: string | null;
  p_exclude_from_budget: boolean;
};

export type CreateExpenseTransactionRow = {
  entry_id: string;
  line_id: string;
  budget_impact_created: boolean;
  budget_period_id: string | null;
  budget_bucket_id: string | null;
  budget_excluded: boolean;
  warning_code: ExpenseBudgetWarningCode | null;
};

export type UpdateExpenseTransactionArgs = CreateExpenseTransactionArgs & {
  p_entry_id: string;
};

export type UpdateExpenseTransactionRow = CreateExpenseTransactionRow;

type ViewDefinition<Row> = {
  Row: Row & Record<string, unknown>;
  Relationships: [];
};

type TableDefinition<Row> = {
  Row: Row & Record<string, unknown>;
  Insert: Partial<Row> & Record<string, unknown>;
  Update: Partial<Row> & Record<string, unknown>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      balance_snapshots: TableDefinition<BalanceSnapshotRow>;
      budget_buckets: TableDefinition<BudgetBucketRow>;
      budget_periods: TableDefinition<BudgetPeriodRow>;
      budget_allocations: TableDefinition<BudgetAllocationRow>;
      budget_impacts: TableDefinition<BudgetImpactRow>;
      categories: TableDefinition<ExpenseCategoryRow>;
      journal_entries: TableDefinition<JournalEntryRow>;
    };
    Views: {
      vw_net_worth: ViewDefinition<NetWorthView>;
      vw_account_balances: ViewDefinition<AccountBalanceView>;
      vw_budget_execution: ViewDefinition<BudgetExecutionView>;
      vw_monthly_financial_summary: ViewDefinition<MonthlyFinancialSummaryView>;
      vw_transaction_details: ViewDefinition<TransactionDetailView>;
    };
    Functions: {
      create_transfer_transaction: { Args: TransferArgs; Returns: TransferResult[] };
      preview_balance_reconciliation: { Args: { p_account_id: string; p_snapshot_at: string }; Returns: ReconciliationPreviewRow[] };
      reconcile_account_balance: { Args: ReconciliationSaveArgs; Returns: ReconciliationResult[] };
      save_monthly_budget: { Args: SaveMonthlyBudgetArgs; Returns: SaveMonthlyBudgetRow[] };
      create_expense_transaction: {
        Args: CreateExpenseTransactionArgs;
        Returns: CreateExpenseTransactionRow[];
      };
      update_expense_transaction: {
        Args: UpdateExpenseTransactionArgs;
        Returns: UpdateExpenseTransactionRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export interface BudgetBucketRow {
  id: string;
  name: string;
  bucket_kind: BudgetBucketKind;
  sort_order: number;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}
export interface BudgetPeriodRow {
  id: string;
  start_date: string;
  end_date: string;
  planned_income: number;
  currency: string;
  status: BudgetPeriodStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}
export interface BudgetAllocationRow {
  id: string;
  budget_period_id: string;
  budget_bucket_id: string;
  planned_amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}
export type SaveMonthlyBudgetArgs = {
  p_month: string;
  p_planned_income: number;
  p_allocations: Array<{ budget_bucket_id: string; planned_amount: number }>;
  p_period_id: string | null;
  p_expected_updated_at: string | null;
};
export interface SaveMonthlyBudgetRow {
  budget_period_id: string;
  period_status: "active";
  period_updated_at: string;
  planned_total_allocated: number;
  planned_unallocated: number;
  backfilled_count: number;
  pending_transaction_count: number;
  warning_codes: string[];
}
