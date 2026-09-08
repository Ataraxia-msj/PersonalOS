export type AccountType = "cash" | "savings" | "investment" | "credit";

export type TransactionIcon =
  | "home"
  | "briefcase"
  | "bank"
  | "train"
  | "coffee"
  | "shopping-bag"
  | "utensils"
  | "phone"
  | "heart";

export interface Account {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  balance: number;
}

export interface Transaction {
  id: string;
  date: string;
  merchant: string;
  category: string;
  accountId: string;
  accountName: string;
  amount: number;
  icon: TransactionIcon;
  editable: boolean;
  excludedFromBudget: boolean;
  budgetLabel: string;
}

export interface BudgetCategory {
  id: string;
  category: string;
  limit: number;
  spent: number;
  color: "terracotta" | "sand" | "slate" | "rose";
  trend: number[];
  remaining: number;
  executionRate: number | null;
  changeFromPrevious: number | null;
}

export interface BudgetSection {
  id: "spending" | "allocation";
  title: "消费预算" | "资金安排";
  categories: BudgetCategory[];
}

export interface BudgetMonth {
  status: "draft" | "active" | "closed";
  id: string;
  label: string;
  editable: boolean;
  sections: BudgetSection[];
  plannedTotal: number;
  actualTotal: number;
  remainingTotal: number;
  executionRate: number | null;
}

export interface MonthlyCashflow {
  month: string;
  income: number;
  expense: number;
}

export interface FinanceDataset {
  asOf: string;
  accounts: Account[];
  transactions: Transaction[];
  budgetMonths: BudgetMonth[];
  cashflow: MonthlyCashflow[];
}

export interface FinanceOverviewData {
  totalAssets: number | null;
  totalLiabilities: number | null;
  netWorth: number | null;
  monthlyIncome: number | null;
  monthlyExpense: number | null;
  cashflow: MonthlyCashflow[];
  transactions: Transaction[];
}

export interface FinanceSummary {
  totalAssets: number;
  monthlyIncome: number;
  monthlyExpense: number;
}

export interface CategorySpending {
  category: string;
  amount: number;
}

export interface ExpenseAccountOption {
  id: string;
  name: string;
  institution: string | null;
  accountClass: "asset" | "liability";
  currency: string;
  balance: number;
}

export interface ExpenseCategoryOption {
  id: string;
  name: string;
  defaultBudgetBucketId: string | null;
}

export interface ExpenseBudgetBucketOption {
  id: string;
  name: string;
  kind: "expense" | "saving" | "investment" | "debt" | "other";
}

export interface ExpenseBudgetPeriodOption {
  id: string;
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "closed";
  buckets: ExpenseBudgetBucketOption[];
}

export interface ExpenseTransactionFormData {
  budgetBuckets: ExpenseBudgetBucketOption[];
  accounts: ExpenseAccountOption[];
  categories: ExpenseCategoryOption[];
  budgetPeriods: ExpenseBudgetPeriodOption[];
}

export interface BudgetFormData {
  period: { id: string; month: string; income: number; updatedAt: string; status: "draft" | "active" | "closed"; currency: string } | null;
  periods: Array<{ id: string; startDate: string; endDate: string }>;
  buckets: Array<{ id: string; name: string; kind: ExpenseBudgetBucketOption["kind"]; active: boolean; amount: number | null }>;
  defaultMonth: string;
}

export interface ExpenseTransactionInitialValues {
  entryId: string;
  occurredAt: string;
  amount: number;
  accountId: string;
  categoryId: string;
  budgetBucketId: string;
  description: string;
  excludeFromBudget: boolean;
  budgetLocked: boolean;
}

export interface ExpenseTransactionEditData {
  formData: ExpenseTransactionFormData;
  initialValues: ExpenseTransactionInitialValues;
}
