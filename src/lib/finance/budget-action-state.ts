import type { SaveMonthlyBudgetRow } from "./types";
export interface BudgetActionState {
  status: "idle" | "success" | "error";
  message: string | null;
  errors: Record<string, string>;
  result: SaveMonthlyBudgetRow | null;
}
export const initialBudgetActionState: BudgetActionState = { status: "idle", message: null, errors: {}, result: null };
