# Finance Analysis Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide one authoritative database source for overall budget execution, monthly comparisons, category spending and explainable financial insights.

**Architecture:** Extend the existing monthly summary View, then layer three `security_invoker` Views over existing ledger and budget data. SQL owns all finance formulas; the frontend receives typed, already-computed facts.

**Tech Stack:** PostgreSQL Views/window functions/ordered-set aggregates, Supabase RLS, Node SQL integration tests.

**Spec:** `docs/superpowers/specs/2026-10-03-finance-phase-one-completion-design.md`

## Global Constraints

- All Views use `security_invoker = true` and retain authenticated/RLS behavior.
- Excluded expenses remain monthly spending but never budget execution.
- Natural-month joins define MoM/YoY; missing comparison or zero denominator returns null.
- No historical data rewrite, guessed net-worth history or configurable thresholds.
- Migration must fail safely if the fixed-necessary bucket preflight is ambiguous.

## Review Focus

- An excluded expense affects cashflow/category analysis but not budget execution.
- Missing calendar months cannot turn a non-adjacent row into a false MoM or consecutive-negative insight.
- Percentages with zero denominators return null, never infinity or zero-by-guess.
- Category anomaly detection excludes the current transaction and refuses fewer than five historical samples.
- Insight keys remain stable and duplicate-free across repeated reads.

---

### Task 1: Monthly summary and analysis Views

**Files:**
- Create: `supabase/migrations/202610030003_financial_analysis_views.sql`
- Create: `supabase/tests/financial_analysis_views.mjs`

**Interfaces:**
- Consumes: the existing definition of `vw_monthly_financial_summary`, budget execution and ledger tables.
- Produces: added summary columns `actual_total_allocated`, `overall_execution_rate`, `monthly_balance` and `vw_monthly_financial_analysis`.

- [ ] Write fixtures/tests for normal, zero-plan, over-100%, excluded-expense, missing-month, cross-year YoY and zero-comparison cases.
- [ ] Run tests and verify the required columns/View are absent.
- [ ] Recreate the monthly summary compatibly with every existing column plus the three new fields and exact formulas in the spec.
- [ ] Create `vw_monthly_financial_analysis` using self joins on exact prior month and prior year dates; emit values, deltas and nullable percentage changes.
- [ ] Verify all SQL tests pass and existing View consumers retain their columns.
- [ ] Commit: `feat: add monthly financial analysis views`.

### Task 2: Category spending View

**Files:**
- Modify: `supabase/migrations/202610030003_financial_analysis_views.sql`
- Modify: `supabase/tests/financial_analysis_views.mjs`

**Interfaces:**
- Consumes: confirmed expense entries/lines/accounts/categories.
- Produces: `vw_monthly_category_spending(month, currency, category_id, category_name, actual_amount, transaction_count, month_share, month_rank)`.

- [ ] Add failing tests that include excluded expenses and exclude income, transfers, void/draft rows and non-expense categories.
- [ ] Implement Shanghai calendar-month grouping, account-class-aware positive expense magnitude, per-currency totals, rank and nullable share.
- [ ] Run category tests and verify pass.
- [ ] Commit: `feat: add category spending analysis view`.

### Task 3: Financial insights View

**Files:**
- Create: `supabase/migrations/202610030004_financial_insights.sql`
- Create: `supabase/checks/financial_insights_preflight.sql`
- Create: `supabase/tests/financial_insights.mjs`

**Interfaces:**
- Consumes: Tasks 1-2 Views, budget execution, account balances and confirmed expense transactions.
- Produces: `vw_financial_insights` with stable keys, severity, explanation metrics and nullable related IDs.

- [ ] Write the preflight assertion for exactly one active fixed-necessary expense bucket named `固定必要开销` or legacy alias `固定必要`.
- [ ] Add failing tests for 80-100% budget reminder, >100% warning, missing budget, overallocated plan, one/two-month negative cashflow, anomaly thresholds/sample floor and low liquidity.
- [ ] Add failing tests for no-data suppression, gap months and stable unique keys.
- [ ] Implement the View as explicit `UNION ALL` rule branches with compatible typed columns and deterministic keys.
- [ ] Add grants/schema reload without changing table RLS or grants.
- [ ] Run all insight tests and the preflight fixture tests.
- [ ] Commit: `feat: add explainable financial insights`.

### Task 4: Typed query contract

**Files:**
- Modify: `src/lib/finance/types.ts`
- Modify: `src/lib/finance/queries.ts`
- Modify: `src/lib/finance/queries.test.ts`

**Interfaces:**
- Consumes: all new View columns from Tasks 1-3.
- Produces: `getMonthlyFinancialAnalysis(client, month?)`, `getMonthlyCategorySpending(client, month)`, `getFinancialInsights(client, month)` and extended monthly summary types.

- [ ] Add failing query tests for exact View names, month filters, ordering, 12-month range limits and error propagation.
- [ ] Add precise View interfaces and Database schema entries; nullable SQL outputs remain nullable in TypeScript.
- [ ] Implement typed queries without page/component database calls.
- [ ] Run focused tests and `npm run typecheck`.
- [ ] Commit: `feat: add typed finance analysis queries`.

