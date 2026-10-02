import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccountClass, AccountType, CreateAccountArgs, Database, SetAccountActiveArgs, UpdateAccountArgs } from "./types";

export type AccountManagementMutationClient = SupabaseClient<Database>;

export interface AccountMetadataInput {
  name: string;
  accountClass: AccountClass;
  accountType: AccountType;
  currency: string;
  institution: string | null;
  includeInNetWorth: boolean;
  sortOrder: number;
  note: string | null;
}

export interface CreateManagedAccountInput extends AccountMetadataInput {
  requestId: string;
  initialBalance: number;
  balanceAt: string;
}

export interface UpdateManagedAccountInput extends AccountMetadataInput {
  accountId: string;
  expectedUpdatedAt: string;
}

export interface SetManagedAccountActiveInput {
  accountId: string;
  expectedUpdatedAt: string;
  isActive: boolean;
}

export class AccountManagementMutationError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
    this.name = "AccountManagementMutationError";
  }
}

function mutationError(error: { message: string; code?: string | null }) {
  return new AccountManagementMutationError(error.message, error.code ?? null);
}

function metadataArgs(input: AccountMetadataInput) {
  return {
    p_account_class: input.accountClass,
    p_account_type: input.accountType,
    p_currency: input.currency,
    p_include_in_net_worth: input.includeInNetWorth,
    p_institution: input.institution,
    p_name: input.name,
    p_note: input.note,
    p_sort_order: input.sortOrder,
  };
}

export async function createManagedAccount(client: AccountManagementMutationClient, input: CreateManagedAccountInput) {
  const args: CreateAccountArgs = {
    ...metadataArgs(input),
    p_balance_at: input.balanceAt,
    p_initial_balance: input.initialBalance,
    p_request_id: input.requestId,
  };
  const { data, error } = await client.rpc("create_account", args);
  if (error) throw mutationError(error);
  const row = data?.[0];
  if (!row) throw new AccountManagementMutationError("create_account returned no result");
  return {
    accountId: row.account_id,
    snapshotId: row.snapshot_id,
    updatedAt: row.account_updated_at,
    replayed: row.replayed,
  };
}

export async function updateManagedAccount(client: AccountManagementMutationClient, input: UpdateManagedAccountInput) {
  const args: UpdateAccountArgs = {
    ...metadataArgs(input),
    p_account_id: input.accountId,
    p_expected_updated_at: input.expectedUpdatedAt,
  };
  const { data, error } = await client.rpc("update_account", args);
  if (error) throw mutationError(error);
  const row = data?.[0];
  if (!row) throw new AccountManagementMutationError("update_account returned no result");
  return {
    accountId: row.account_id,
    structureLocked: row.structure_locked,
    updatedAt: row.account_updated_at,
  };
}

export async function setManagedAccountActive(
  client: AccountManagementMutationClient,
  input: SetManagedAccountActiveInput,
) {
  const args: SetAccountActiveArgs = {
    p_account_id: input.accountId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_is_active: input.isActive,
  };
  const { data, error } = await client.rpc("set_account_active", args);
  if (error) throw mutationError(error);
  const row = data?.[0];
  if (!row) throw new AccountManagementMutationError("set_account_active returned no result");
  return { accountId: row.account_id, isActive: row.is_active, updatedAt: row.account_updated_at };
}
