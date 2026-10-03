# Income and Transfer Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe atomic editing for confirmed manual income and current-format transfer transactions.

**Architecture:** Two `SECURITY INVOKER` PostgreSQL RPCs own all ledger mutations. Typed mutations, validation, services and reusable forms expose editing without allowing pages to query or update tables directly.

**Tech Stack:** PostgreSQL/PLpgSQL, Supabase SSR, Next.js 15 App Router, TypeScript, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-finance-phase-one-completion-design.md`

## Global Constraints

- Work on `develop`; do not use service role, secret key or direct client table writes.
- Only `manual + confirmed` income and structurally valid current-format transfers are editable.
- Preserve closed-period budget impacts and return an explicit warning.
- No refund, adjustment, void, delete or transaction-type conversion.
- No mock fallback or optimistic fake data.

## Review Focus

- A malformed or legacy two-line transfer remains read-only and the RPC rejects it.
- A transfer edit crossing open months moves exactly one impact; crossing from a closed impact preserves exactly that impact.
- Repeated or uncertain requests cannot duplicate lines or impacts.
- Disabled accounts/categories/buckets reject new values without corrupting the original transaction.
- Multi-currency or wrong account-class transfer edits roll back atomically.

---

### Task 1: Editing RPC migration

**Files:**
- Create: `supabase/migrations/202610030002_income_transfer_editing.sql`
- Create: `supabase/tests/income_transfer_editing.mjs`

**Interfaces:**
- Consumes: existing `journal_entries`, `journal_lines`, `budget_impacts`, `accounts`, `categories`, `budget_periods`, `budget_allocations`, `budget_buckets` and advisory lock `(1782, 1)`.
- Produces: `update_income_transaction(...)` and `update_transfer_transaction(...)`, plus edit metadata exposed compatibly through `vw_transaction_details`.

- [ ] Write database tests for successful income edits, all four transfer purposes, invalid structures, permission denial, account/category/bucket validation, open-period re-attribution, missing-budget warnings, closed-impact preservation and atomic rollback.
- [ ] Run the test harness or isolated SQL parser and verify the new functions are absent/failing before implementation.
- [ ] Implement `update_income_transaction` with the exact validation and one-entry/one-line atomic update from the spec.
- [ ] Implement `update_transfer_transaction` with deterministic line validation, two-line update and open/closed impact rules from the spec.
- [ ] Extend `vw_transaction_details` only with fields needed to identify safe edit state; preserve every existing column and grant.
- [ ] Revoke execution from `public, anon`, grant to `authenticated`, notify PostgREST, and keep the migration transactional with lock timeouts.
- [ ] Run database tests and verify all cases pass.
- [ ] Commit: `feat: add income and transfer editing rpcs`.

### Task 2: Typed edit data and mutations

**Files:**
- Modify: `src/lib/finance/types.ts`
- Modify: `src/lib/finance/queries.ts`
- Modify: `src/lib/finance/service.ts`
- Modify: `src/lib/finance/income-types.ts`
- Modify: `src/lib/finance/income-validation.ts`
- Modify: `src/lib/finance/income-mutations.ts`
- Modify: `src/lib/finance/transfer-types.ts`
- Modify: `src/lib/finance/transfer-validation.ts`
- Modify: `src/lib/finance/transfer-mutations.ts`
- Test: `src/lib/finance/queries.test.ts`
- Test: `src/lib/finance/service.test.ts`
- Test: `src/lib/finance/income-validation.test.ts`
- Test: `src/lib/finance/income-mutations.test.ts`
- Test: `src/lib/finance/transfer.test.ts`
- Test: `src/lib/finance/transfer-service.test.ts`

**Interfaces:**
- Consumes: RPC rows from Task 1 and grouped `TransactionDetailView` rows.
- Produces: `getIncomeTransactionEditData(entryId)`, `getTransferTransactionEditData(entryId)`, `updateIncomeTransaction(client, input)`, and `updateTransferTransaction(client, input)`.

- [ ] Add failing tests proving only exact safe income/transfer structures produce edit data and that account direction, purpose, memo, bucket and date map exactly.
- [ ] Add failing tests proving validation emits exact update RPC arguments and rejects changed type, invalid IDs, future dates, invalid account pairs and incompatible bucket purposes.
- [ ] Add failing mutation tests asserting the exact RPC names/parameter keys and error propagation.
- [ ] Add typed RPC Args/Returns and edit UI models; do not loosen existing create types.
- [ ] Implement the two edit queries/services using one server client and concurrent option reads.
- [ ] Implement update validation and typed mutation functions.
- [ ] Run the focused Vitest files and verify pass.
- [ ] Commit: `feat: add transaction editing data layer`.

### Task 3: Income edit UI and action

**Files:**
- Modify: `src/features/finance/components/income-transaction-form.tsx`
- Modify: `src/features/finance/components/income-transaction-form.test.tsx`
- Create: `src/app/finance/transactions/[entryId]/edit/income-actions.ts`
- Modify: `src/app/finance/transactions/[entryId]/edit/page.tsx`
- Test: `src/app/finance/transactions/[entryId]/edit/actions.test.ts`

**Interfaces:**
- Consumes: `getIncomeTransactionEditData` and `updateIncomeTransaction` from Task 2.
- Produces: income edit form mode and authenticated update action with Finance route revalidation.

- [ ] Add failing component tests for populated edit fields, edit title/button, disabled duplicate submit and preserved input on uncertain result.
- [ ] Add failing action tests for auth validation, exact mutation call, error mapping and required revalidation paths.
- [ ] Extend `IncomeTransactionForm` with create/edit mode and initial values while preserving the create API.
- [ ] Implement the income update action and route dispatch by actual entry type; return `notFound()` for unsafe or missing records.
- [ ] Run focused component/action tests and verify pass.
- [ ] Commit: `feat: add income transaction editing`.

### Task 4: Transfer edit UI and action

**Files:**
- Modify: `src/features/finance/components/transfer-transaction-form.tsx`
- Modify: `src/features/finance/components/transfer-transaction-form.test.tsx`
- Create: `src/app/finance/transactions/[entryId]/edit/transfer-actions.ts`
- Modify: `src/app/finance/transactions/[entryId]/edit/page.tsx`
- Modify: `src/app/finance/transactions/[entryId]/edit/actions.test.ts`

**Interfaces:**
- Consumes: `getTransferTransactionEditData` and `updateTransferTransaction` from Task 2.
- Produces: transfer edit form mode, closed-budget warning rendering and authenticated update action.

- [ ] Add failing component tests for all populated transfer fields, purpose/bucket dependencies, general-transfer budget exclusion and uncertain retry identity.
- [ ] Add failing action tests for success, warning codes, structural rejection, auth loss and revalidation.
- [ ] Extend `TransferTransactionForm` with create/edit mode without sharing create request IDs with update identity.
- [ ] Implement transfer update action with explicit warning copy, including `budget_period_closed_preserved`.
- [ ] Run focused tests and verify pass.
- [ ] Commit: `feat: add transfer transaction editing`.

### Task 5: Transaction list editability and integration

**Files:**
- Modify: `src/lib/finance/adapters.ts`
- Modify: `src/lib/finance/adapters.test.ts`
- Modify: `src/features/finance/components/transaction-list.tsx`
- Test: `src/features/finance/components/finance-sections.test.tsx`

**Interfaces:**
- Consumes: edit metadata and structure rules from Tasks 1-2.
- Produces: `Transaction.editable` for safe expense, income and current-format transfer entries.

- [ ] Add failing adapter/list tests proving safe income/current transfer rows expose edit links and legacy/malformed/unsupported rows do not.
- [ ] Implement editability mapping without weakening existing expense checks.
- [ ] Run focused and full tests, then `npm run typecheck` and `npm run build`.
- [ ] Commit: `feat: expose editable income and transfers`.

