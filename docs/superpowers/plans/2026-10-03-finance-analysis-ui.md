# Finance Analysis UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal Analysis screen with a responsive real-data dashboard and show authoritative overall execution on Budget.

**Architecture:** One finance service creates one Supabase server client, launches independent View queries concurrently and maps them through pure adapters into focused UI models. Server Components load data; small client components own month navigation and accessible chart/list interactions.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Recharts, CSS Modules, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-03-finance-phase-one-completion-design.md`

## Global Constraints

- UI displays database formulas and never reconstructs finance business logic.
- Default to latest available month; trends show the preceding 12 natural months.
- Missing data renders `—` or a genuine empty state, never mock fallback.
- Preserve the existing warm-black visual language and responsive navigation.
- Do not fabricate historical net worth.

## Review Focus

- A selected month with missing prior-year data renders a neutral `—`, not a misleading 0%.
- Values above 100% remain visible and receive warning styling without clipping the numeric label.
- Negative deltas use meaning-aware styling: expense increases are adverse while income increases are favorable.
- Long insight explanations and category names remain readable on mobile without horizontal dependence.
- Query failures reach the error boundary instead of becoming an empty dashboard.

---

### Task 1: Analysis UI models, adapters and service

**Files:**
- Modify: `src/features/finance/types.ts`
- Modify: `src/lib/finance/adapters.ts`
- Modify: `src/lib/finance/adapters.test.ts`
- Modify: `src/lib/finance/service.ts`
- Modify: `src/lib/finance/service.test.ts`

**Interfaces:**
- Consumes: typed queries from the database plan.
- Produces: `FinanceAnalysisPageData` containing available months, selected summary/comparisons, 12-month trend, budget buckets, categories, insights and current net-worth snapshot.

- [ ] Add failing adapter tests for nullable comparison values, adverse/favorable semantics, exact 12-month ordering, category ranks and insight severity order.
- [ ] Add failing service tests proving one client, concurrent independent queries, latest-month default, explicit valid month selection and no swallowed errors.
- [ ] Define focused UI types and pure adapters; preserve raw values needed for accessible labels.
- [ ] Implement `getAnalysisPageData(month?: string)` with `Promise.all()` and no duplicate View query.
- [ ] Run focused tests and verify pass.
- [ ] Commit: `feat: build finance analysis data model`.

### Task 2: Budget overall execution

**Files:**
- Modify: `src/features/finance/types.ts`
- Modify: `src/lib/finance/adapters.ts`
- Modify: `src/lib/finance/adapters.test.ts`
- Modify: `src/features/finance/components/budget-list.tsx`
- Modify: `src/app/finance/budget/page.test.tsx`

**Interfaces:**
- Consumes: `overall_execution_rate` and `actual_total_allocated` from the extended summary View.
- Produces: authoritative `BudgetMonth.executionRate` and actual/remaining totals.

- [ ] Add failing tests for null/zero, ordinary, exact-100 and over-100 execution.
- [ ] Map the database rate without component calculation and render `—` only for null.
- [ ] Add accessible warning styling for over-budget values while keeping the true percentage.
- [ ] Run budget tests and verify pass.
- [ ] Commit: `feat: show overall budget execution`.

### Task 3: Analysis dashboard components

**Files:**
- Replace: `src/features/finance/components/spending-analysis.tsx`
- Create: `src/features/finance/components/analysis-summary.tsx`
- Create: `src/features/finance/components/analysis-trend-chart.tsx`
- Create: `src/features/finance/components/analysis-budget-section.tsx`
- Create: `src/features/finance/components/analysis-category-section.tsx`
- Create: `src/features/finance/components/analysis-insights.tsx`
- Create: `src/features/finance/components/analysis-dashboard.test.tsx`
- Modify: `src/features/finance/components/finance.module.css`

**Interfaces:**
- Consumes: `FinanceAnalysisPageData` from Task 1.
- Produces: accessible desktop/mobile dashboard sections with no data fetching.

- [ ] Write failing component tests for core cards, MoM/YoY nulls and deltas, trend labels, six buckets, category ranks, insight severity/evidence and genuine empty states.
- [ ] Implement the summary and comparison cards.
- [ ] Implement the accessible 12-month income/expense/balance chart.
- [ ] Implement budget, category and insight sections as focused components.
- [ ] Add responsive styles: multi-column desktop and single-column mobile with no required horizontal scroll.
- [ ] Run component tests and verify pass.
- [ ] Commit: `feat: build finance analysis dashboard`.

### Task 4: Route month selection and integration

**Files:**
- Modify: `src/app/finance/analysis/page.tsx`
- Create: `src/app/finance/analysis/page.test.tsx`
- Modify: `src/components/shell/command-menu.tsx` only if its analysis label/copy is stale.

**Interfaces:**
- Consumes: `getAnalysisPageData(month?)` and dashboard components.
- Produces: `/finance/analysis?month=YYYY-MM` with latest-month default and validated selection.

- [ ] Add failing route tests for absent, valid and invalid month parameters and service error propagation.
- [ ] Implement server-side month selection and canonical links/select navigation without client finance computation.
- [ ] Run route and full test suites.
- [ ] Commit: `feat: integrate monthly finance analysis`.

### Task 5: Final verification and deployment handoff

**Files:**
- Modify documentation only if actual migration filenames or operator steps changed.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified develop branch and exact migration execution order for the user.

- [ ] Run `npm test` and require all tests pass.
- [ ] Run `npm run typecheck` and require exit code 0.
- [ ] Run `npm run build` and require exit code 0.
- [ ] Run `git diff --check` and inspect `git status --short` for only intended changes.
- [ ] Start or reuse the local app and perform read-only desktop/mobile checks of transactions, budget and analysis.
- [ ] Provide the migration files in order; do not claim production write verification before the user executes them.
- [ ] After migrations are executed, perform authenticated read verification and user-directed small write smoke tests.
- [ ] Commit any verification-only fixes separately.
