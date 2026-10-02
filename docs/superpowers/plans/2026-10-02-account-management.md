# Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated account creation, editing, activation management, and initial balance snapshots to the existing Finance accounts experience.

**Architecture:** Server Components read through focused finance-management queries and services; Client Components submit Server Actions that validate Auth claims and invoke typed `SECURITY INVOKER` RPCs. Account creation atomically inserts the account and its first snapshot, while updates use `updated_at` optimistic concurrency and never edit balances.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase SSR, PostgreSQL PL/pgSQL, Vitest, Testing Library, PGlite isolation tests.

**Spec:** `docs/superpowers/specs/2026-10-02-account-category-management-design.md`

## Global Constraints

- Use only the Supabase publishable key, authenticated cookie session, RLS, and `SECURITY INVOKER`; never use a service-role/secret key or database password.
- Page and UI components must not call `.from()`, `.rpc()`, `insert`, or `update` directly.
- Do not physically delete accounts or rewrite historical journal lines or snapshots.
- Create writes are idempotent by stable request UUID; updates reject stale `expected_updated_at` values.
- Account class/type/currency become immutable once any journal line or balance snapshot exists.
- Do not fabricate optimistic balances or fall back to mock data.
- Preserve the current Finance visual language and responsive behavior.

## Review Focus

- Double-submit or retry after an uncertain response must create exactly one account and one snapshot; Task 1 tests identical replay and conflicting payload reuse.
- A browser clock around an Asia/Shanghai boundary must serialize the intended instant; Task 3 tests exact `+08:00` conversion and future rejection.
- A stale edit from another tab must not overwrite a newer name or status; Tasks 1 and 3 test `updated_at` conflicts.
- Deactivating an account with history must preserve its balance facts while removing it from transaction selectors; Tasks 1 and 4 test both outcomes.
- Liability starting balances and class/type compatibility must retain the database's positive-balance convention; Tasks 1 and 3 test a liability account and invalid cross-class types.

---

### Task 1: Account management PostgreSQL RPCs

**Files:**
- Create: `supabase/migrations/202610020001_account_management.sql`
- Create: `supabase/tests/account_management.mjs`
- Reuse: `supabase/tests/fixtures/transfer_base.sql`

**Interfaces:**
- Produces: `public.create_account(p_request_id uuid, p_name text, p_account_class text, p_account_type text, p_currency text, p_institution text, p_include_in_net_worth boolean, p_sort_order integer, p_note text, p_initial_balance numeric, p_balance_at timestamptz)` returning `account_id`, `snapshot_id`, `account_updated_at`, `replayed`.
- Produces: `public.update_account(p_account_id uuid, p_expected_updated_at timestamptz, p_name text, p_account_class text, p_account_type text, p_currency text, p_institution text, p_include_in_net_worth boolean, p_sort_order integer, p_note text)` returning `account_id`, `account_updated_at`, `structure_locked`.
- Produces: `public.set_account_active(p_account_id uuid, p_expected_updated_at timestamptz, p_is_active boolean)` returning `account_id`, `account_updated_at`, `is_active`.

- [ ] **Step 1: Write the failing isolated PostgreSQL test**

Add named scenarios asserting: authenticated creation yields exactly one account and one manual snapshot; asset and liability inputs work; identical replay returns the same IDs; changed replay raises `request_payload_conflict`; injected snapshot failure rolls back the account; invalid amount/time/currency/sort/class-type fail; a structural update is rejected after a snapshot or journal line; metadata update succeeds; stale `updated_at` fails; deactivate/reactivate preserves snapshots and lines; anon/public cannot execute; grants, policies, and Views are otherwise unchanged.

- [ ] **Step 2: Run the red test**

Run: `node supabase/tests/account_management.mjs <absolute-pglite-index> --red`

Expected: FAIL with `account management RPCs must exist`.

- [ ] **Step 3: Implement the migration**

Use `SECURITY INVOKER`, `set search_path = ''`, bounded statement/lock timeouts, schema-qualified references, `current_user = 'authenticated'`, and non-null `auth.uid()`. Reuse the existing advisory transaction lock `(1782, 1)`. Validate the existing account class/type matrix, uppercase currency, finite numeric bounds, and non-future timestamp. Use `p_request_id` as the account ID so replay can be validated before mutable-state checks. Insert the initial snapshot with `source = 'manual'` in the same transaction. Map uniqueness violations to stable application error messages without exposing raw constraints.

- [ ] **Step 4: Run the green database test**

Run: `node supabase/tests/account_management.mjs <absolute-pglite-index>`

Expected: all account-management scenarios print `PASS` and exit 0.

- [ ] **Step 5: Commit the database unit**

```bash
git add supabase/migrations/202610020001_account_management.sql supabase/tests/account_management.mjs
git commit -m "feat: add account management RPCs"
```

### Task 2: Account management types, reads, adapters, and service

**Files:**
- Modify: `src/lib/finance/types.ts`
- Create: `src/lib/finance/account-management-types.ts`
- Create: `src/lib/finance/account-management-queries.ts`
- Create: `src/lib/finance/account-management-queries.test.ts`
- Create: `src/lib/finance/account-management-service.ts`
- Create: `src/lib/finance/account-management-service.test.ts`
- Create: `src/lib/finance/account-management-adapters.ts`
- Create: `src/lib/finance/account-management-adapters.test.ts`

**Interfaces:**
- Produces: `AccountRow`, `JournalLineRow`, `ManagedAccount`, `AccountEditData`, and Database function typings for all Task 1 RPCs.
- Produces: `getManagedAccountRows(client): Promise<AccountRow[]>`, `getAllAccountBalances(client): Promise<AccountBalanceView[]>`, `getAccountReferenceState(client, accountId): Promise<{ hasLines: boolean; hasSnapshots: boolean }>`.
- Produces: `adaptManagedAccounts(rows, balances): ManagedAccount[]` and `adaptAccountEditData(row, balance, referenceState): AccountEditData`.
- Produces: `getAccountManagementPageData(): Promise<ManagedAccount[]>` and `getAccountEditData(accountId): Promise<AccountEditData | null>`.

- [ ] **Step 1: Write failing query, adapter, and service tests**

Assert that reads include inactive accounts, merge a missing View balance as `null` rather than zero, preserve exact database account type/class values, detect both snapshot and journal-line references, use one server client per service call, and run independent queries concurrently.

- [ ] **Step 2: Run focused tests to verify red state**

Run: `npm test -- src/lib/finance/account-management-queries.test.ts src/lib/finance/account-management-adapters.test.ts src/lib/finance/account-management-service.test.ts`

Expected: FAIL because the modules and interfaces do not exist.

- [ ] **Step 3: Add exact database and UI types**

Add raw account/table fields including `updated_at` and the three RPC argument/result definitions to `src/lib/finance/types.ts`. Keep management UI models in `account-management-types.ts`; do not expand the existing four-icon `Account` display model into a database model.

- [ ] **Step 4: Implement reads, adapters, and services**

Read all accounts ordered by `sort_order`, `name`, `id`; read the unfiltered account-balance View separately; use head/count queries for the selected edit record's snapshot and journal-line references. Services create one Supabase server client and pass it to every query. Return `null` for a missing account.

- [ ] **Step 5: Run focused tests to verify green state**

Run: `npm test -- src/lib/finance/account-management-queries.test.ts src/lib/finance/account-management-adapters.test.ts src/lib/finance/account-management-service.test.ts`

Expected: all focused tests pass.

- [ ] **Step 6: Commit the read layer**

```bash
git add src/lib/finance/types.ts src/lib/finance/account-management-*.ts
git commit -m "feat: add account management data layer"
```

### Task 3: Account validation, typed mutations, and Server Actions

**Files:**
- Create: `src/lib/finance/account-management-validation.ts`
- Create: `src/lib/finance/account-management-validation.test.ts`
- Create: `src/lib/finance/account-management-mutations.ts`
- Create: `src/lib/finance/account-management-mutations.test.ts`
- Create: `src/lib/finance/account-management-action-state.ts`
- Create: `src/app/finance/accounts/actions.ts`
- Create: `src/app/finance/accounts/actions.test.ts`

**Interfaces:**
- Produces: `validateCreateAccount(formData, now): AccountCreateValidationResult`, `validateUpdateAccount(formData): AccountUpdateValidationResult`, and `validateSetAccountActive(formData): AccountActiveValidationResult`.
- Produces: `createManagedAccount(client, input)`, `updateManagedAccount(client, input)`, and `setManagedAccountActive(client, input)` typed RPC wrappers.
- Produces: `createAccountAction`, `updateAccountAction`, and `setAccountActiveAction` Server Actions returning `AccountManagementActionState`.

- [ ] **Step 1: Write failing validation and mutation tests**

Cover stable UUID normalization, name trimming, class-specific allowed types, uppercase three-letter currency, zero and two-decimal balances, invalid/negative/too-large values, Asia/Shanghai datetime conversion, future time, integer sort order, optional text normalization, exact RPC names/arguments, and preservation of database error code/message.

- [ ] **Step 2: Run the library tests red**

Run: `npm test -- src/lib/finance/account-management-validation.test.ts src/lib/finance/account-management-mutations.test.ts`

Expected: FAIL because validators and wrappers do not exist.

- [ ] **Step 3: Implement validators and typed RPC wrappers**

Reuse existing UUID, money, and Shanghai datetime helpers where their contracts match. Keep the allowed asset/liability type map exported for both validation and UI filtering. Mutation wrappers call each RPC exactly once and reject empty result arrays.

- [ ] **Step 4: Run the library tests green**

Run: `npm test -- src/lib/finance/account-management-validation.test.ts src/lib/finance/account-management-mutations.test.ts`

Expected: all library tests pass.

- [ ] **Step 5: Write failing Server Action tests**

Assert verified `getClaims()` before validation/write, no RPC on invalid or unauthenticated input, exact wrapper calls, Chinese mapping for every stable migration error, missing-migration handling, stale-write messaging, and `revalidatePath('/finance', 'layout')` only after confirmed success.

- [ ] **Step 6: Implement the Server Actions**

Use one SSR client per action. Return field errors for validation failures and generic messages for unknown errors. Do not expose database internals. Include replay success copy that does not imply a second account was created.

- [ ] **Step 7: Run the action tests green**

Run: `npm test -- src/app/finance/accounts/actions.test.ts`

Expected: all account action tests pass.

- [ ] **Step 8: Commit the write layer**

```bash
git add src/lib/finance/account-management-* src/app/finance/accounts/actions.ts src/app/finance/accounts/actions.test.ts
git commit -m "feat: add account management actions"
```

### Task 4: Account management pages and responsive forms

**Files:**
- Modify: `src/app/finance/accounts/page.tsx`
- Create: `src/app/finance/accounts/new/page.tsx`
- Create: `src/app/finance/accounts/[accountId]/edit/page.tsx`
- Modify: `src/features/finance/components/account-list.tsx`
- Create: `src/features/finance/components/account-management-form.tsx`
- Create: `src/features/finance/components/account-management-form.test.tsx`
- Modify: `src/features/finance/components/finance.module.css`
- Modify: `src/features/finance/components/reconciliation-form.test.tsx`

**Interfaces:**
- Consumes: Task 2 page/edit services and Task 3 actions.
- Produces: `AccountManagementForm` with `mode: 'create' | 'edit'`, `initialValues`, `structureLocked`, and action props.

- [ ] **Step 1: Write failing component and page tests**

Assert active accounts display by default, inactive reveal works without a network write, new/edit links are correct, estimated balance uses `null` copy rather than fake zero, class selection filters compatible types, edit mode locks structural fields when required, balance fields exist only in create mode, activation requires explicit action, request UUID remains stable across retry, duplicate submit is disabled, stale and success messages render, calibration links remain intact, and mobile markup has labels for every control.

- [ ] **Step 2: Run the UI tests red**

Run: `npm test -- src/features/finance/components/account-management-form.test.tsx src/features/finance/components/reconciliation-form.test.tsx`

Expected: new account-management assertions fail.

- [ ] **Step 3: Implement the account list management state**

Keep filtering client-side over server-provided real rows. Add status metadata, edit/new links, and the inactive toggle. Preserve balance calibration/history links for every account, including inactive records.

- [ ] **Step 4: Implement create/edit routes and the shared form**

Use native form controls and existing Finance styles. Generate a stable create request UUID in the client, retain it after uncertain errors, and disable it only after confirmed success. Edit routes return `notFound()` for unknown IDs and render server-provided lock state. Do not add a balance field to edit mode.

- [ ] **Step 5: Add responsive styling and pass UI tests**

Run: `npm test -- src/features/finance/components/account-management-form.test.tsx src/features/finance/components/reconciliation-form.test.tsx`

Expected: all tests pass and prior calibration behavior remains covered.

- [ ] **Step 6: Commit the account UI**

```bash
git add src/app/finance/accounts src/features/finance/components/account-list.tsx src/features/finance/components/account-management-form* src/features/finance/components/finance.module.css src/features/finance/components/reconciliation-form.test.tsx
git commit -m "feat: add account management pages"
```

### Task 5: Account-management verification and handoff

**Files:**
- Modify if needed: `docs/superpowers/plans/2026-10-02-account-management.md` checkboxes only

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: a reviewed migration file for the user to execute before application release.

- [ ] **Step 1: Run the complete verification suite sequentially**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

Run: `npm test`

Expected: all test files pass.

Run: `npm run build`

Expected: production build succeeds and the new account routes are listed.

- [ ] **Step 2: Run repository safety checks**

Run: `git diff --check` and a focused scan for `service_role`, secret keys, database URLs, and passwords in changed application/migration files.

Expected: no whitespace errors or sensitive credentials.

- [ ] **Step 3: Present the migration for manual production execution**

Stop before production writes. Give the user `supabase/migrations/202610020001_account_management.sql`, summarize its functions and grants, and wait for explicit confirmation that it was executed.

- [ ] **Step 4: Perform authenticated read-only browser QA after deployment**

Verify the account list, inactive toggle, create form, edit form, responsive layout, and console errors. Do not submit an account; the first production write belongs to the user.

- [ ] **Step 5: Commit any verification-only fixes**

```bash
git add <only-files-changed-by-verification>
git commit -m "fix: finalize account management"
```
