import type {
  AccountRow,
  BudgetBucketRow,
  BudgetPeriodRow,
  BudgetAllocationRow,
  BudgetImpactRow,
  ExpenseCategoryRow,
  JournalEntryRow,
  JournalLineRow,
  NetWorthView,
  AccountBalanceView,
  BudgetExecutionView,
  MonthlyFinancialSummaryView,
  MonthlyFinancialAnalysisView,
  MonthlyCategorySpendingView,
  FinancialInsightView,
  TransactionDetailView,
  CreateAccountArgs,
  CreateAccountRow,
  CreateCategoryArgs,
  CreateCategoryRow,
  CreateIncomeTransactionArgs,
  CreateIncomeTransactionRow,
  UpdateIncomeTransactionArgs,
  UpdateIncomeTransactionRow,
  SaveMonthlyBudgetArgs,
  SaveMonthlyBudgetRow,
  CreateExpenseTransactionArgs,
  CreateExpenseTransactionRow,
  UpdateExpenseTransactionArgs,
  UpdateExpenseTransactionRow,
  SetAccountActiveArgs,
  SetAccountActiveRow,
  SetCategoryActiveArgs,
  SetCategoryActiveRow,
  UpdateAccountArgs,
  UpdateAccountRow,
  UpdateCategoryArgs,
  UpdateCategoryRow,
} from "@/lib/finance/types";
import type {
  BalanceSnapshotRow,
  ReconciliationPreviewRow,
  ReconciliationResult,
  ReconciliationSaveArgs,
} from "@/lib/finance/reconciliation-types";
import type {
  TransferArgs,
  TransferResult,
  UpdateTransferArgs,
  UpdateTransferResult,
} from "@/lib/finance/transfer-types";
import type {
  AffairsRowMap,
  AffairsRpcArgsMap,
  AffairsRpcReceiptRow,
  ProjectProgressRow,
  DailyContributionRow,
  CoinBalanceRow,
  CoinLedgerRow,
} from "@/lib/affairs/types";
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

export interface FinanceDatabase {
  public: {
    Tables: {
      accounts: TableDefinition<AccountRow>;
      balance_snapshots: TableDefinition<BalanceSnapshotRow>;
      budget_buckets: TableDefinition<BudgetBucketRow>;
      budget_periods: TableDefinition<BudgetPeriodRow>;
      budget_allocations: TableDefinition<BudgetAllocationRow>;
      budget_impacts: TableDefinition<BudgetImpactRow>;
      categories: TableDefinition<ExpenseCategoryRow>;
      journal_entries: TableDefinition<JournalEntryRow>;
      journal_lines: TableDefinition<JournalLineRow>;
    };
    Views: {
      vw_net_worth: ViewDefinition<NetWorthView>;
      vw_account_balances: ViewDefinition<AccountBalanceView>;
      vw_budget_execution: ViewDefinition<BudgetExecutionView>;
      vw_monthly_financial_summary: ViewDefinition<MonthlyFinancialSummaryView>;
      vw_monthly_financial_analysis: ViewDefinition<MonthlyFinancialAnalysisView>;
      vw_monthly_category_spending: ViewDefinition<MonthlyCategorySpendingView>;
      vw_financial_insights: ViewDefinition<FinancialInsightView>;
      vw_transaction_details: ViewDefinition<TransactionDetailView>;
    };
    Functions: {
      create_account: {
        Args: CreateAccountArgs;
        Returns: CreateAccountRow[];
      };
      create_category: {
        Args: CreateCategoryArgs;
        Returns: CreateCategoryRow[];
      };
      create_income_transaction: {
        Args: CreateIncomeTransactionArgs;
        Returns: CreateIncomeTransactionRow[];
      };
      update_income_transaction: {
        Args: UpdateIncomeTransactionArgs;
        Returns: UpdateIncomeTransactionRow[];
      };
      create_transfer_transaction: {
        Args: TransferArgs;
        Returns: TransferResult[];
      };
      update_transfer_transaction: {
        Args: UpdateTransferArgs;
        Returns: UpdateTransferResult[];
      };
      preview_balance_reconciliation: {
        Args: { p_account_id: string; p_snapshot_at: string };
        Returns: ReconciliationPreviewRow[];
      };
      reconcile_account_balance: {
        Args: ReconciliationSaveArgs;
        Returns: ReconciliationResult[];
      };
      save_monthly_budget: {
        Args: SaveMonthlyBudgetArgs;
        Returns: SaveMonthlyBudgetRow[];
      };
      create_expense_transaction: {
        Args: CreateExpenseTransactionArgs;
        Returns: CreateExpenseTransactionRow[];
      };
      update_expense_transaction: {
        Args: UpdateExpenseTransactionArgs;
        Returns: UpdateExpenseTransactionRow[];
      };
      set_account_active: {
        Args: SetAccountActiveArgs;
        Returns: SetAccountActiveRow[];
      };
      set_category_active: {
        Args: SetCategoryActiveArgs;
        Returns: SetCategoryActiveRow[];
      };
      update_account: {
        Args: UpdateAccountArgs;
        Returns: UpdateAccountRow[];
      };
      update_category: {
        Args: UpdateCategoryArgs;
        Returns: UpdateCategoryRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

type AffairsTables = {
  [K in keyof AffairsRowMap as `affairs_${K}`]: TableDefinition<
    AffairsRowMap[K]
  >;
};
type AffairsFunctions = {
  [K in keyof AffairsRpcArgsMap]: {
    Args: AffairsRpcArgsMap[K];
    Returns: AffairsRpcReceiptRow[];
  };
};
export interface Database {
  public: {
    Tables: FinanceDatabase["public"]["Tables"] & AffairsTables;
    Views: FinanceDatabase["public"]["Views"] & {
      vw_affairs_project_progress: ViewDefinition<ProjectProgressRow>;
      vw_affairs_daily_contributions: ViewDefinition<DailyContributionRow>;
      vw_affairs_coin_balance: ViewDefinition<CoinBalanceRow>;
      vw_affairs_coin_ledger: ViewDefinition<CoinLedgerRow>;
    };
    Functions: FinanceDatabase["public"]["Functions"] & AffairsFunctions;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
