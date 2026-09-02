export type AccountType = "cash" | "savings" | "investment" | "credit";

export type TransactionIcon =
  | "home"
  | "briefcase"
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
  amount: number;
  icon: TransactionIcon;
}

export interface BudgetCategory {
  id: string;
  category: string;
  limit: number;
  spent: number;
  color: "terracotta" | "sand" | "slate" | "rose";
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
  budgets: BudgetCategory[];
  cashflow: MonthlyCashflow[];
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
