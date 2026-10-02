# Account and Category Management Design

## Objective

Allow the single authenticated Personal OS user to manage finance accounts and transaction categories without using the Supabase dashboard. The feature must preserve historical financial facts, keep all writes behind typed PostgreSQL RPCs, and remain consistent with the existing Supabase SSR and service-layer architecture.

## Scope

### Included

- Create, edit, deactivate, reactivate, and order accounts.
- Create an account and its initial balance snapshot atomically.
- Create, edit, deactivate, reactivate, and order expense and income categories.
- Assign an active expense budget bucket as an expense category's default.
- Display active and inactive records in management pages.
- Preserve existing balance calibration and transaction workflows.

### Excluded

- Physical deletion of accounts or categories.
- Budget bucket management.
- Category parent/child hierarchy; new and edited records keep `parent_id` null.
- Editing historical transactions or balance snapshots from management forms.
- Import, bulk editing, or multi-currency conversion.

## User Experience

### Accounts

`/finance/accounts` retains the current balance list and calibration links, and adds:

- an `新增账户` action;
- an edit action for each account;
- status, net-worth inclusion, class, type, and currency metadata;
- a control to reveal inactive accounts.

`/finance/accounts/new` contains:

- name;
- account class;
- compatible account type;
- currency, defaulting to `CNY`;
- institution;
- current balance;
- balance timestamp in Asia/Shanghai;
- include-in-net-worth flag;
- non-negative sort order;
- optional note.

Creating an account atomically inserts one `accounts` row and one manual `balance_snapshots` row. A zero starting balance is valid. Editing an account never changes its balance; balance changes remain in the existing calibration workflow.

`/finance/accounts/[accountId]/edit` permits name, institution, net-worth inclusion, sort order, note, and active-state management. Account class, type, and currency can be changed only while the account has neither journal lines nor balance snapshots. Because creation always writes an initial snapshot, accounts created through this UI have those structural fields locked immediately. This is intentional: correcting a mistaken structure requires creating the correct account and deactivating the incorrect empty account rather than rewriting balance semantics.

Inactive accounts stay visible in management mode and can be reactivated. They do not appear in transaction or transfer forms.

### Categories

`/finance/categories` is a new Finance navigation destination with separate expense and income sections. Each section supports active and inactive records and links to create/edit pages.

Category fields are:

- name;
- category type;
- default budget bucket for expense categories only;
- non-negative sort order;
- optional note;
- active status on edit.

Only active `expense` budget buckets are eligible defaults. Income categories must have no default bucket. Changing a default affects future attribution only; persisted transaction and budget-impact history remains unchanged.

Category type can change only when no journal line references the category. Parent categories are not exposed in this version and `parent_id` remains null.

## Architecture

### Read path

```text
Server Component
  -> finance management service
  -> typed query functions
  -> one Supabase SSR server client per request
  -> accounts/categories/budget_buckets and existing balance View
```

Page components do not contain `.from()` calls. Independent reads use `Promise.all()`.

The accounts management service combines account metadata with the existing estimated-balance View and reference-existence checks required by edit forms. The categories service reads all categories, active expense budget buckets, and category-use state for the selected edit record.

### Write path

```text
Form
  -> Server Action
  -> validated Auth claims
  -> input validation
  -> typed RPC wrapper
  -> SECURITY INVOKER PostgreSQL RPC
  -> revalidate affected Finance routes
```

Pages and browser components never insert or update tables directly.

### RPCs

- `create_account`
- `update_account`
- `set_account_active`
- `create_category`
- `update_category`
- `set_category_active`

Create RPCs accept a client-generated request UUID and are idempotent. Update and activation RPCs accept the record's expected `updated_at` value and reject stale writes.

All functions:

- use `SECURITY INVOKER`;
- require `current_user = 'authenticated'` and a non-null `auth.uid()`;
- revoke execution from `public` and `anon`;
- grant execution only to `authenticated`;
- preserve existing RLS and table grants;
- use schema-qualified names and an empty `search_path`.

No service-role key, secret key, database password, or direct browser write is introduced.

## Validation and Invariants

### Accounts

- Name is non-empty, length-limited, and unique.
- Account class is `asset` or `liability`.
- Account type is valid for its class according to existing constraints.
- Currency is exactly three uppercase ASCII letters.
- Starting balance is finite, non-negative, within numeric bounds, and has at most two decimal places.
- Snapshot timestamp is finite and no later than the database clock.
- Sort order is a non-negative integer.
- Structural fields cannot change after any journal line or balance snapshot exists.
- Deactivation never changes or removes historical rows.

### Categories

- Name is non-empty, length-limited, and unique within category type.
- Category type is `expense` or `income`.
- Sort order is a non-negative integer.
- Income categories always have a null default budget bucket.
- An expense default bucket, when present, must exist, be active, and have `bucket_kind = 'expense'`.
- Category type cannot change after a journal line references the category.
- Default changes never rewrite journal lines or budget impacts.
- Deactivation never changes or removes historical rows.

### Concurrency and idempotency

- Create forms generate a stable request UUID that survives retry until the result is known.
- Reusing a request UUID with identical input returns the original result.
- Reusing it with different input fails with `request_payload_conflict`.
- Updates compare `expected_updated_at`; stale writes fail without partial changes.
- Account creation rolls back both account and initial snapshot if either write fails.

## Error Handling

Server Actions translate stable database error codes into concise Chinese messages, including:

- duplicate account or category name;
- incompatible account class/type;
- locked structural fields;
- category type locked by historical use;
- inactive or incompatible default budget bucket;
- stale edit requiring refresh;
- expired authentication;
- missing migration.

Unknown errors return a generic failure message and do not expose database internals.

## Data Refresh

Successful account writes revalidate:

- `/finance` layout;
- `/finance/accounts`;
- transaction creation routes that consume active accounts.

Successful category writes revalidate:

- `/finance` layout;
- `/finance/categories`;
- expense and income creation/edit routes that consume active categories.

The UI never fabricates optimistic account balances or category state.

## Testing

### PostgreSQL isolation tests

- authenticated-only execution and anon/public denial;
- account plus initial snapshot atomicity;
- create idempotency and conflicting replay rejection;
- class/type, currency, amount, timestamp, and sort validation;
- structural-field locking after history exists;
- category-type locking after use;
- default-bucket compatibility;
- stale update rejection;
- deactivate/reactivate behavior with unchanged historical facts.

### Application tests

- typed query and service behavior;
- server-side input validation;
- RPC argument mapping and error translation;
- account and category list/form components;
- active/inactive visibility;
- compatible type and bucket option behavior;
- stable request identity and duplicate-submit protection;
- route revalidation after confirmed writes.

### Release verification

- full unit/component suite;
- TypeScript check;
- ESLint;
- production Next.js build;
- authenticated production read-only inspection after deployment;
- the user performs the first production write.

