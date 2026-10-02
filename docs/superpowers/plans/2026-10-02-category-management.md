# Category Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated expense and income category creation, editing, activation management, ordering, and future-only default budget-bucket assignment.

**Architecture:** A dedicated category-management service reads all categories and eligible expense buckets through one Supabase SSR client. Typed Server Actions call focused `SECURITY INVOKER` RPCs; database validation prevents historical category-type rewrites and incompatible default buckets.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase SSR, PostgreSQL PL/pgSQL, Vitest, Testing Library, PGlite isolation tests.

**Spec:** `docs/superpowers/specs/2026-10-02-account-category-management-design.md`

## Global Constraints

- Use only the Supabase publishable key, authenticated cookie session, RLS, and `SECURITY INVOKER`; never use a service-role/secret key or database password.
- Page and UI components must not call `.from()`, `.rpc()`, `insert`, or `update` directly.
- Do not physically delete categories or rewrite historical journal lines, saved budget buckets, or budget impacts.
- Create writes are idempotent by stable request UUID; updates reject stale `expected_updated_at` values.
- Parent/child category management is out of scope and managed records keep `parent_id = null`.
- Income categories cannot have default budget buckets; expense defaults must be active expense buckets.
- Do not fall back to mock data.

## Review Focus

- Changing a default bucket must affect future transactions only and leave existing line attribution and impacts byte-for-byte unchanged; Task 1 tests historical rows before and after update.
- A category name may repeat across income and expense but not within one type; Task 1 tests both cases and user-facing duplicate errors.
- Changing type on an unused category may invalidate a default bucket; Tasks 1 and 3 test server-side rejection of an income default, UI submission of null for income, and incompatible expense defaults.
- Deactivating a category must remove it from new transaction forms without breaking historical transaction labels; Tasks 1 and 4 test both read paths.
- A stale edit or activation from another tab must fail without partial changes; Tasks 1 and 3 test `updated_at` conflicts.

---

### Task 1: Category management PostgreSQL RPCs

**Files:**
- Create: `supabase/migrations/202610020002_category_management.sql`
- Create: `supabase/tests/category_management.mjs`
- Reuse: `supabase/tests/fixtures/transfer_base.sql`

**Interfaces:**
- Produces: `public.create_category(p_request_id uuid, p_name text, p_category_type text, p_default_budget_bucket_id uuid, p_sort_order integer, p_note text)` returning `category_id`, `category_updated_at`, `replayed`.
- Produces: `public.update_category(p_category_id uuid, p_expected_updated_at timestamptz, p_name text, p_category_type text, p_default_budget_bucket_id uuid, p_sort_order integer, p_note text)` returning `category_id`, `category_updated_at`, `type_locked`.
- Produces: `public.set_category_active(p_category_id uuid, p_expected_updated_at timestamptz, p_is_active boolean)` returning `category_id`, `category_updated_at`, `is_active`.

- [ ] **Step 1: Write the failing isolated PostgreSQL test**

Add named scenarios asserting: authenticated create for expense/income; same name across types allowed; duplicate within a type rejected; income default rejected; missing/inactive/non-expense bucket rejected; identical replay succeeds; changed replay conflicts; unused category type can change; used category type cannot change; default changes leave existing journal lines and impacts unchanged; stale edit/activation fails; deactivate/reactivate preserves history; anon/public cannot execute; unrelated grants, policies, and Views remain unchanged.

- [ ] **Step 2: Run the red test**

Run: `node supabase/tests/category_management.mjs <absolute-pglite-index> --red`

Expected: FAIL with `category management RPCs must exist`.

- [ ] **Step 3: Implement the migration**

Use the same security, qualification, timeouts, and advisory-lock conventions as account management. Use `p_request_id` as the category ID. Normalize names and notes, enforce `parent_id = null`, reject non-null defaults for income, validate active expense buckets before writes, check journal-line references before changing category type, and translate uniqueness conflicts into stable errors.

- [ ] **Step 4: Run the green database test**

Run: `node supabase/tests/category_management.mjs <absolute-pglite-index>`

Expected: all category-management scenarios print `PASS` and exit 0.

- [ ] **Step 5: Commit the database unit**

```bash
git add supabase/migrations/202610020002_category_management.sql supabase/tests/category_management.mjs
git commit -m "feat: add category management RPCs"
```

### Task 2: Category management types, reads, adapters, and service

**Files:**
- Modify: `src/lib/finance/types.ts`
- Create: `src/lib/finance/category-management-types.ts`
- Create: `src/lib/finance/category-management-queries.ts`
- Create: `src/lib/finance/category-management-queries.test.ts`
- Create: `src/lib/finance/category-management-service.ts`
- Create: `src/lib/finance/category-management-service.test.ts`
- Create: `src/lib/finance/category-management-adapters.ts`
- Create: `src/lib/finance/category-management-adapters.test.ts`

**Interfaces:**
- Produces: RPC argument/result typings, `ManagedCategory`, `CategoryManagementPageData`, and `CategoryEditData`.
- Produces: `getAllCategories(client): Promise<ExpenseCategoryRow[]>`, `getActiveExpenseBudgetBuckets(client): Promise<BudgetBucketRow[]>`, and `getCategoryReferenceState(client, categoryId): Promise<{ hasLines: boolean }>`.
- Produces: `adaptManagedCategories(rows): ManagedCategory[]` and `adaptCategoryEditData(row, buckets, referenceState): CategoryEditData`.
- Produces: `getCategoryManagementPageData(): Promise<CategoryManagementPageData>` and `getCategoryEditData(categoryId): Promise<CategoryEditData | null>`.

- [ ] **Step 1: Write failing query, adapter, and service tests**

Assert all active/inactive categories are read in stable `category_type`, `sort_order`, `name`, `id` order; only active expense buckets are options; used-state comes from journal-line references; inactive/default bucket names remain truthful in list data; one server client is shared; independent reads are concurrent; missing category returns `null`.

- [ ] **Step 2: Run focused tests red**

Run: `npm test -- src/lib/finance/category-management-queries.test.ts src/lib/finance/category-management-adapters.test.ts src/lib/finance/category-management-service.test.ts`

Expected: FAIL because category management modules do not exist.

- [ ] **Step 3: Add types and implement reads/adapters/services**

Keep raw database rows in `types.ts` and UI models in the focused management module. Query categories directly rather than reusing active-only transaction queries. Preserve an inactive historical default bucket's name for display but exclude it from selectable options.

- [ ] **Step 4: Run focused tests green**

Run: `npm test -- src/lib/finance/category-management-queries.test.ts src/lib/finance/category-management-adapters.test.ts src/lib/finance/category-management-service.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit the read layer**

```bash
git add src/lib/finance/types.ts src/lib/finance/category-management-*.ts
git commit -m "feat: add category management data layer"
```

### Task 3: Category validation, mutations, and Server Actions

**Files:**
- Create: `src/lib/finance/category-management-validation.ts`
- Create: `src/lib/finance/category-management-validation.test.ts`
- Create: `src/lib/finance/category-management-mutations.ts`
- Create: `src/lib/finance/category-management-mutations.test.ts`
- Create: `src/lib/finance/category-management-action-state.ts`
- Create: `src/app/finance/categories/actions.ts`
- Create: `src/app/finance/categories/actions.test.ts`

**Interfaces:**
- Produces: `validateCreateCategory`, `validateUpdateCategory`, and `validateSetCategoryActive` returning typed validation results.
- Produces: `createManagedCategory`, `updateManagedCategory`, and `setManagedCategoryActive` typed RPC wrappers.
- Produces: `createCategoryAction`, `updateCategoryAction`, and `setCategoryActiveAction` Server Actions.

- [ ] **Step 1: Write failing validator and mutation tests**

Cover UUID normalization, name trimming/length, exact type enum, non-negative integer sort order, optional note normalization, expense bucket UUID, forced null income default, exact RPC argument mapping, empty-result rejection, and preservation of error code/message.

- [ ] **Step 2: Run library tests red**

Run: `npm test -- src/lib/finance/category-management-validation.test.ts src/lib/finance/category-management-mutations.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement validators and typed wrappers**

Do not trust disabled browser fields: validate category type and bucket relationship again in the Server Action layer, while leaving authoritative existence/active/kind checks to PostgreSQL. Each wrapper invokes one RPC exactly once.

- [ ] **Step 4: Run library tests green**

Run: `npm test -- src/lib/finance/category-management-validation.test.ts src/lib/finance/category-management-mutations.test.ts`

Expected: all library tests pass.

- [ ] **Step 5: Write failing action tests**

Assert `getClaims()` validation, no RPC for invalid/unauthenticated input, exact wrapper call, stable Chinese error mapping, missing-migration copy, stale-write handling, and Finance layout revalidation only on success.

- [ ] **Step 6: Implement and pass Server Action tests**

Run: `npm test -- src/app/finance/categories/actions.test.ts`

Expected: all category action tests pass.

- [ ] **Step 7: Commit the write layer**

```bash
git add src/lib/finance/category-management-* src/app/finance/categories/actions.ts src/app/finance/categories/actions.test.ts
git commit -m "feat: add category management actions"
```

### Task 4: Category navigation, list, and forms

**Files:**
- Modify: `src/features/finance/components/finance-tabs.tsx`
- Modify: `src/app/finance/layout.test.tsx`
- Create: `src/app/finance/categories/page.tsx`
- Create: `src/app/finance/categories/new/page.tsx`
- Create: `src/app/finance/categories/[categoryId]/edit/page.tsx`
- Create: `src/features/finance/components/category-list.tsx`
- Create: `src/features/finance/components/category-management-form.tsx`
- Create: `src/features/finance/components/category-management-form.test.tsx`
- Modify: `src/features/finance/components/finance.module.css`

**Interfaces:**
- Consumes: Task 2 services/models and Task 3 Server Actions.
- Produces: `CategoryList` and `CategoryManagementForm` with `mode`, `initialValues`, `typeLocked`, `budgetBuckets`, and action props.

- [ ] **Step 1: Write failing navigation, list, and form tests**

Assert the Finance tabs include and activate `分类`; expense/income sections are separate; inactive reveal is client-side; new/edit links are stable; type selection conditionally renders only expense budget buckets; changing to income clears the submitted bucket; edit mode locks used category type; existing inactive default is shown truthfully but cannot be reselected; request UUID survives retry; pending/confirmed states prevent duplicate submission; every control is labelled for mobile/accessibility.

- [ ] **Step 2: Run UI tests red**

Run: `npm test -- src/app/finance/layout.test.tsx src/features/finance/components/category-management-form.test.tsx`

Expected: category navigation and components are missing.

- [ ] **Step 3: Implement the category list and navigation**

Add the `分类` tab after `账户`. Render real server data in expense/income sections, with clear active/inactive status, edit links, and a local inactive toggle. Do not expose parent category controls.

- [ ] **Step 4: Implement create/edit routes and form**

Generate and preserve a stable request UUID in create mode. Use `notFound()` for unknown edit IDs. Disable category type only when `typeLocked`; always submit authoritative current type. Clear/default budget input when income is selected. Keep active-state changes as an explicit separate action.

- [ ] **Step 5: Add responsive styles and pass UI tests**

Run: `npm test -- src/app/finance/layout.test.tsx src/features/finance/components/category-management-form.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 6: Commit the category UI**

```bash
git add src/features/finance/components/finance-tabs.tsx src/app/finance/layout.test.tsx src/app/finance/categories src/features/finance/components/category-* src/features/finance/components/finance.module.css
git commit -m "feat: add category management pages"
```

### Task 5: Category-management verification and handoff

**Files:**
- Modify if needed: `docs/superpowers/plans/2026-10-02-category-management.md` checkboxes only

**Interfaces:**
- Consumes: Tasks 1-4 and the completed account-management release.
- Produces: a reviewed category migration for user execution and a production-ready frontend release.

- [ ] **Step 1: Run sequential project verification**

Run `npm run typecheck`, `npm run lint`, `npm test`, then `npm run build` sequentially.

Expected: every command exits 0; the production route table includes category list/new/edit routes.

- [ ] **Step 2: Run safety checks**

Run `git diff --check` and scan changed files for service-role/secret keys, database URLs, and passwords.

Expected: no whitespace errors or credentials.

- [ ] **Step 3: Present the migration for manual execution**

Stop before production writes. Give the user `supabase/migrations/202610020002_category_management.sql`, summarize its functions and validation, and wait for confirmation that it ran successfully.

- [ ] **Step 4: Perform authenticated read-only production QA**

Verify the category tab/list/create/edit pages, real buckets, inactive toggle, responsive layout, and browser console. Do not submit a category; the first production write belongs to the user.

- [ ] **Step 5: Commit any verification-only fixes**

```bash
git add <only-files-changed-by-verification>
git commit -m "fix: finalize category management"
```
