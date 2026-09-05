export type ExpenseTransactionActionStatus = "idle" | "success" | "warning" | "error";

export interface ExpenseTransactionActionState {
  status: ExpenseTransactionActionStatus;
  message: string | null;
  entryId: string | null;
  fieldErrors: Partial<Record<
    "occurredAt" | "amount" | "accountId" | "categoryId" | "budgetBucketId" | "description",
    string
  >>;
}

export const initialExpenseTransactionActionState: ExpenseTransactionActionState = {
  entryId: null,
  fieldErrors: {},
  message: null,
  status: "idle",
};
