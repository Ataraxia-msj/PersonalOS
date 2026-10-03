import type { CreateIncomeTransactionResult, UpdateIncomeTransactionResult } from "./income-mutations";

export interface IncomeActionState {
  status: "success" | "error";
  message: string;
  errors: Record<string, string>;
  result: CreateIncomeTransactionResult | UpdateIncomeTransactionResult | null;
}

export const initialIncomeActionState: IncomeActionState = {
  errors: {},
  message: "",
  result: null,
  status: "error",
};
