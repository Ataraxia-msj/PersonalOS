import type { AccountClass, AccountType, BalanceSource } from "./types";

export interface ManagedAccount {
  id: string;
  name: string;
  accountClass: AccountClass;
  accountType: AccountType;
  currency: string;
  institution: string | null;
  includeInNetWorth: boolean;
  isActive: boolean;
  sortOrder: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  estimatedBalance: number | null;
  balanceSource: BalanceSource | null;
  latestSnapshotAt: string | null;
}

export interface AccountEditData extends ManagedAccount {
  hasLines: boolean;
  hasSnapshots: boolean;
  structureLocked: boolean;
}

export interface AccountReferenceState {
  hasLines: boolean;
  hasSnapshots: boolean;
}
