import type { CreateIncomeTransactionResult } from "./income-mutations";

export interface IncomeActionState {
  status: "success" | "error";
  message: string;
  errors: Record<string, string>;
  result: CreateIncomeTransactionResult | null;
}

export const initialIncomeActionState: IncomeActionState = {
  errors: {},
  message: "",
  result: null,
  status: "error",
};
