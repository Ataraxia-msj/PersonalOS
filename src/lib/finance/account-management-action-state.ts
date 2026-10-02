export type AccountManagementActionStatus = "idle" | "success" | "error" | "uncertain";

export interface AccountManagementActionState {
  status: AccountManagementActionStatus;
  message: string | null;
  fieldErrors: Record<string, string>;
  accountId?: string;
  updatedAt?: string;
  replayed?: boolean;
  isActive?: boolean;
}

export const initialAccountManagementActionState: AccountManagementActionState = {
  fieldErrors: {},
  message: null,
  status: "idle",
};
