-- ISOLATED TEST FIXTURE ONLY. Schema copied from user-provided read-only reports.
-- No real account/transaction rows, no connection string, never run on production.
create role authenticated; create role anon;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon;

create table public."accounts" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "account_class" text not null,
  "account_type" text not null,
  "currency" text default 'CNY'::text not null,
  "institution" text,
  "include_in_net_worth" boolean default true not null,
  "is_active" boolean default true not null,
  "sort_order" integer default 0 not null,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."budget_buckets" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "bucket_kind" text not null,
  "sort_order" integer default 0 not null,
  "is_active" boolean default true not null,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."categories" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "category_type" text not null,
  "parent_id" uuid,
  "default_budget_bucket_id" uuid,
  "is_active" boolean default true not null,
  "sort_order" integer default 0 not null,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."budget_periods" (
  "id" uuid default gen_random_uuid() not null,
  "start_date" date not null,
  "end_date" date not null,
  "planned_income" numeric(14,2) not null,
  "currency" text default 'CNY'::text not null,
  "status" text default 'draft'::text not null,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."budget_allocations" (
  "id" uuid default gen_random_uuid() not null,
  "budget_period_id" uuid not null,
  "budget_bucket_id" uuid not null,
  "planned_amount" numeric(14,2) not null,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."journal_entries" (
  "id" uuid default gen_random_uuid() not null,
  "occurred_at" timestamp with time zone default now() not null,
  "entry_type" text not null,
  "description" text not null,
  "source" text default 'manual'::text not null,
  "raw_text" text,
  "status" text default 'confirmed'::text not null,
  "related_entry_id" uuid,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "exclude_from_budget" boolean default false not null
);

create table public."journal_lines" (
  "id" uuid default gen_random_uuid() not null,
  "entry_id" uuid not null,
  "account_id" uuid not null,
  "amount" numeric(14,2) not null,
  "category_id" uuid,
  "memo" text,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "budget_bucket_id" uuid
);

create table public."budget_impacts" (
  "id" uuid default gen_random_uuid() not null,
  "entry_id" uuid not null,
  "line_id" uuid,
  "budget_period_id" uuid not null,
  "budget_bucket_id" uuid not null,
  "amount" numeric(14,2) not null,
  "source" text default 'manual'::text not null,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."balance_snapshots" (
  "id" uuid default gen_random_uuid() not null,
  "account_id" uuid not null,
  "snapshot_at" timestamp with time zone default now() not null,
  "balance" numeric(14,2) not null,
  "source" text default 'manual'::text not null,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table public."accounts" add constraint "accounts_account_class_check" CHECK ((account_class = ANY (ARRAY['asset'::text, 'liability'::text])));
alter table public."accounts" add constraint "accounts_account_type_check" CHECK ((account_type = ANY (ARRAY['cash'::text, 'bank'::text, 'ewallet'::text, 'wallet_pocket'::text, 'money_market'::text, 'time_deposit'::text, 'investment'::text, 'receivable'::text, 'credit_card'::text, 'consumer_credit'::text, 'loan'::text, 'payable'::text, 'other'::text])));
alter table public."accounts" add constraint "accounts_class_type_check" CHECK ((((account_class = 'asset'::text) AND (account_type = ANY (ARRAY['cash'::text, 'bank'::text, 'ewallet'::text, 'wallet_pocket'::text, 'money_market'::text, 'time_deposit'::text, 'investment'::text, 'receivable'::text, 'other'::text]))) OR ((account_class = 'liability'::text) AND (account_type = ANY (ARRAY['credit_card'::text, 'consumer_credit'::text, 'loan'::text, 'payable'::text, 'other'::text])))));
alter table public."accounts" add constraint "accounts_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text));
alter table public."accounts" add constraint "accounts_name_key" UNIQUE (name);
alter table public."accounts" add constraint "accounts_pkey" PRIMARY KEY (id);
alter table public."budget_buckets" add constraint "budget_buckets_bucket_kind_check" CHECK ((bucket_kind = ANY (ARRAY['expense'::text, 'saving'::text, 'investment'::text, 'debt'::text, 'other'::text])));
alter table public."budget_buckets" add constraint "budget_buckets_name_key" UNIQUE (name);
alter table public."budget_buckets" add constraint "budget_buckets_pkey" PRIMARY KEY (id);
alter table public."categories" add constraint "categories_category_type_check" CHECK ((category_type = ANY (ARRAY['expense'::text, 'income'::text])));
alter table public."categories" add constraint "categories_name_type_unique" UNIQUE (name, category_type);
alter table public."categories" add constraint "categories_pkey" PRIMARY KEY (id);
alter table public."categories" add constraint "categories_sort_order_check" CHECK ((sort_order >= 0));
alter table public."categories" add constraint "category_not_own_parent_check" CHECK (((parent_id IS NULL) OR (parent_id <> id)));
alter table public."categories" add constraint "income_no_budget_bucket_check" CHECK (((category_type = 'expense'::text) OR (default_budget_bucket_id IS NULL)));
alter table public."budget_periods" add constraint "budget_periods_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text));
alter table public."budget_periods" add constraint "budget_periods_date_check" CHECK ((end_date >= start_date));
alter table public."budget_periods" add constraint "budget_periods_pkey" PRIMARY KEY (id);
alter table public."budget_periods" add constraint "budget_periods_planned_income_check" CHECK ((planned_income >= (0)::numeric));
alter table public."budget_periods" add constraint "budget_periods_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text])));
alter table public."budget_periods" add constraint "budget_periods_unique_period" UNIQUE (start_date, end_date);
alter table public."budget_allocations" add constraint "budget_allocations_period_bucket_unique" UNIQUE (budget_period_id, budget_bucket_id);
alter table public."budget_allocations" add constraint "budget_allocations_pkey" PRIMARY KEY (id);
alter table public."budget_allocations" add constraint "budget_allocations_planned_amount_check" CHECK ((planned_amount >= (0)::numeric));
alter table public."journal_entries" add constraint "journal_entries_entry_type_check" CHECK ((entry_type = ANY (ARRAY['expense'::text, 'income'::text, 'transfer'::text, 'refund'::text, 'adjustment'::text])));
alter table public."journal_entries" add constraint "journal_entries_not_self_related" CHECK (((related_entry_id IS NULL) OR (related_entry_id <> id)));
alter table public."journal_entries" add constraint "journal_entries_pkey" PRIMARY KEY (id);
alter table public."journal_entries" add constraint "journal_entries_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'ai'::text, 'import'::text, 'reconcile'::text])));
alter table public."journal_entries" add constraint "journal_entries_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'void'::text])));
alter table public."journal_lines" add constraint "journal_lines_amount_check" CHECK ((amount <> (0)::numeric));
alter table public."journal_lines" add constraint "journal_lines_id_entry_unique" UNIQUE (id, entry_id);
alter table public."journal_lines" add constraint "journal_lines_pkey" PRIMARY KEY (id);
alter table public."journal_lines" add constraint "journal_lines_sort_order_check" CHECK ((sort_order >= 0));
alter table public."budget_impacts" add constraint "budget_impacts_amount_check" CHECK ((amount <> (0)::numeric));
alter table public."budget_impacts" add constraint "budget_impacts_pkey" PRIMARY KEY (id);
alter table public."budget_impacts" add constraint "budget_impacts_source_check" CHECK ((source = ANY (ARRAY['auto'::text, 'ai'::text, 'manual'::text, 'import'::text])));
alter table public."balance_snapshots" add constraint "balance_snapshots_account_time_unique" UNIQUE (account_id, snapshot_at);
alter table public."balance_snapshots" add constraint "balance_snapshots_balance_check" CHECK ((balance >= (0)::numeric));
alter table public."balance_snapshots" add constraint "balance_snapshots_pkey" PRIMARY KEY (id);
alter table public."balance_snapshots" add constraint "balance_snapshots_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'import'::text, 'system'::text])));
alter table public."categories" add constraint "categories_default_budget_bucket_id_fkey" FOREIGN KEY (default_budget_bucket_id) REFERENCES budget_buckets(id) ON DELETE RESTRICT;
alter table public."categories" add constraint "categories_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE RESTRICT;
alter table public."budget_allocations" add constraint "budget_allocations_budget_bucket_id_fkey" FOREIGN KEY (budget_bucket_id) REFERENCES budget_buckets(id) ON DELETE RESTRICT;
alter table public."budget_allocations" add constraint "budget_allocations_budget_period_id_fkey" FOREIGN KEY (budget_period_id) REFERENCES budget_periods(id) ON DELETE CASCADE;
alter table public."journal_entries" add constraint "journal_entries_related_entry_id_fkey" FOREIGN KEY (related_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL;
alter table public."journal_lines" add constraint "journal_lines_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
alter table public."journal_lines" add constraint "journal_lines_budget_bucket_id_fkey" FOREIGN KEY (budget_bucket_id) REFERENCES budget_buckets(id) ON DELETE RESTRICT;
alter table public."journal_lines" add constraint "journal_lines_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT;
alter table public."journal_lines" add constraint "journal_lines_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE;
alter table public."budget_impacts" add constraint "budget_impacts_budget_bucket_id_fkey" FOREIGN KEY (budget_bucket_id) REFERENCES budget_buckets(id) ON DELETE RESTRICT;
alter table public."budget_impacts" add constraint "budget_impacts_budget_period_id_fkey" FOREIGN KEY (budget_period_id) REFERENCES budget_periods(id) ON DELETE RESTRICT;
alter table public."budget_impacts" add constraint "budget_impacts_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE;
alter table public."budget_impacts" add constraint "budget_impacts_line_entry_fk" FOREIGN KEY (line_id, entry_id) REFERENCES journal_lines(id, entry_id) ON DELETE CASCADE;
alter table public."balance_snapshots" add constraint "balance_snapshots_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;

create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger set_accounts_updated_at before update on public."accounts" for each row execute function public.set_updated_at();
alter table public."accounts" enable row level security;
create policy authenticated_full_access on public."accounts" for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public."accounts" to authenticated;
create trigger set_budget_buckets_updated_at before update on public."budget_buckets" for each row execute function public.set_updated_at();
alter table public."budget_buckets" enable row level security;
create policy authenticated_full_access on public."budget_buckets" for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public."budget_buckets" to authenticated;
create trigger set_categories_updated_at before update on public."categories" for each row execute function public.set_updated_at();
alter table public."categories" enable row level security;
create policy authenticated_full_access on public."categories" for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public."categories" to authenticated;
create trigger set_budget_periods_updated_at before update on public."budget_periods" for each row execute function public.set_updated_at();
alter table public."budget_periods" enable row level security;
create policy authenticated_full_access on public."budget_periods" for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public."budget_periods" to authenticated;
create trigger set_budget_allocations_updated_at before update on public."budget_allocations" for each row execute function public.set_updated_at();
alter table public."budget_allocations" enable row level security;
create policy authenticated_full_access on public."budget_allocations" for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public."budget_allocations" to authenticated;
create trigger set_journal_entries_updated_at before update on public."journal_entries" for each row execute function public.set_updated_at();
alter table public."journal_entries" enable row level security;
create policy authenticated_full_access on public."journal_entries" for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public."journal_entries" to authenticated;
create trigger set_journal_lines_updated_at before update on public."journal_lines" for each row execute function public.set_updated_at();
alter table public."journal_lines" enable row level security;
create policy authenticated_full_access on public."journal_lines" for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public."journal_lines" to authenticated;
create trigger set_budget_impacts_updated_at before update on public."budget_impacts" for each row execute function public.set_updated_at();
alter table public."budget_impacts" enable row level security;
create policy authenticated_full_access on public."budget_impacts" for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public."budget_impacts" to authenticated;
create trigger set_balance_snapshots_updated_at before update on public."balance_snapshots" for each row execute function public.set_updated_at();
alter table public."balance_snapshots" enable row level security;
create policy authenticated_full_access on public."balance_snapshots" for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public."balance_snapshots" to authenticated;

create view public.vw_account_balances with (security_invoker=true) as  SELECT a.id AS account_id,
    a.name AS account_name,
    a.account_class,
    a.account_type,
    a.currency,
    a.institution,
    a.include_in_net_worth,
    a.is_active,
    a.sort_order,
    s.snapshot_at AS latest_snapshot_at,
    s.balance AS latest_snapshot_balance,
    COALESCE(sum(jl.amount) FILTER (WHERE je.status = 'confirmed'::text AND je.occurred_at <= now() AND (s.snapshot_at IS NULL OR je.occurred_at > s.snapshot_at)), 0::numeric) AS ledger_change_after_snapshot,
    COALESCE(s.balance, 0::numeric) + COALESCE(sum(jl.amount) FILTER (WHERE je.status = 'confirmed'::text AND je.occurred_at <= now() AND (s.snapshot_at IS NULL OR je.occurred_at > s.snapshot_at)), 0::numeric) AS estimated_balance,
        CASE
            WHEN s.snapshot_at IS NULL THEN 'ledger_only'::text
            WHEN COALESCE(sum(jl.amount) FILTER (WHERE je.status = 'confirmed'::text AND je.occurred_at <= now() AND je.occurred_at > s.snapshot_at), 0::numeric) = 0::numeric THEN 'snapshot'::text
            ELSE 'snapshot_plus_ledger'::text
        END AS balance_source
   FROM accounts a
     LEFT JOIN LATERAL ( SELECT bs.snapshot_at,
            bs.balance
           FROM balance_snapshots bs
          WHERE bs.account_id = a.id AND bs.snapshot_at <= now()
          ORDER BY bs.snapshot_at DESC
         LIMIT 1) s ON true
     LEFT JOIN journal_lines jl ON jl.account_id = a.id
     LEFT JOIN journal_entries je ON je.id = jl.entry_id
  GROUP BY a.id, a.name, a.account_class, a.account_type, a.currency, a.institution, a.include_in_net_worth, a.is_active, a.sort_order, s.snapshot_at, s.balance;
grant select on public.vw_account_balances to authenticated;

create view public.vw_net_worth with (security_invoker=true) as  SELECT currency,
    COALESCE(sum(estimated_balance) FILTER (WHERE account_class = 'asset'::text AND include_in_net_worth = true), 0::numeric) AS total_assets,
    COALESCE(sum(estimated_balance) FILTER (WHERE account_class = 'liability'::text AND include_in_net_worth = true), 0::numeric) AS total_liabilities,
    COALESCE(sum(estimated_balance) FILTER (WHERE account_class = 'asset'::text AND include_in_net_worth = true), 0::numeric) - COALESCE(sum(estimated_balance) FILTER (WHERE account_class = 'liability'::text AND include_in_net_worth = true), 0::numeric) AS net_worth
   FROM vw_account_balances
  GROUP BY currency;
grant select on public.vw_net_worth to authenticated;

create view public.vw_budget_execution with (security_invoker=true) as  SELECT bp.id AS budget_period_id,
    bp.start_date,
    bp.end_date,
    bp.status AS period_status,
    bp.currency,
    bp.planned_income,
    bb.id AS budget_bucket_id,
    bb.name AS budget_bucket_name,
    bb.bucket_kind,
    bb.sort_order,
    ba.planned_amount,
    COALESCE(sum(
        CASE
            WHEN je.status = 'confirmed'::text THEN bi.amount
            ELSE 0::numeric
        END), 0::numeric) AS actual_amount,
    ba.planned_amount - COALESCE(sum(
        CASE
            WHEN je.status = 'confirmed'::text THEN bi.amount
            ELSE 0::numeric
        END), 0::numeric) AS remaining_amount,
        CASE
            WHEN ba.planned_amount > 0::numeric THEN round(COALESCE(sum(
            CASE
                WHEN je.status = 'confirmed'::text THEN bi.amount
                ELSE 0::numeric
            END), 0::numeric) / ba.planned_amount * 100::numeric, 2)
            ELSE NULL::numeric
        END AS execution_rate
   FROM budget_allocations ba
     JOIN budget_periods bp ON bp.id = ba.budget_period_id
     JOIN budget_buckets bb ON bb.id = ba.budget_bucket_id
     LEFT JOIN budget_impacts bi ON bi.budget_period_id = bp.id AND bi.budget_bucket_id = bb.id
     LEFT JOIN journal_entries je ON je.id = bi.entry_id
  GROUP BY bp.id, bp.start_date, bp.end_date, bp.status, bp.currency, bp.planned_income, bb.id, bb.name, bb.bucket_kind, bb.sort_order, ba.planned_amount;
grant select on public.vw_budget_execution to authenticated;

create view public.vw_monthly_financial_summary with (security_invoker=true) as  WITH periods AS (
         SELECT bp.id,
            bp.start_date,
            bp.end_date,
            bp.planned_income,
            bp.currency,
            bp.status,
            bp.note,
            bp.created_at,
            bp.updated_at,
            (bp.start_date::timestamp without time zone AT TIME ZONE 'Asia/Shanghai'::text) AS period_start_at,
            ((bp.end_date + 1)::timestamp without time zone AT TIME ZONE 'Asia/Shanghai'::text) AS period_end_exclusive,
            LEAST(now(), ((bp.end_date + 1)::timestamp without time zone AT TIME ZONE 'Asia/Shanghai'::text)) AS summary_as_of
           FROM budget_periods bp
        ), planned AS (
         SELECT ba.budget_period_id,
            COALESCE(sum(ba.planned_amount), 0::numeric) AS planned_total_allocated,
            COALESCE(sum(ba.planned_amount) FILTER (WHERE bb.bucket_kind = 'expense'::text), 0::numeric) AS planned_expense,
            COALESCE(sum(ba.planned_amount) FILTER (WHERE bb.bucket_kind = 'saving'::text), 0::numeric) AS planned_saving,
            COALESCE(sum(ba.planned_amount) FILTER (WHERE bb.bucket_kind = 'investment'::text), 0::numeric) AS planned_investment,
            COALESCE(sum(ba.planned_amount) FILTER (WHERE bb.bucket_kind = 'debt'::text), 0::numeric) AS planned_debt
           FROM budget_allocations ba
             JOIN budget_buckets bb ON bb.id = ba.budget_bucket_id
          GROUP BY ba.budget_period_id
        ), actual_budget AS (
         SELECT bi.budget_period_id,
            COALESCE(sum(bi.amount) FILTER (WHERE bb.bucket_kind = 'expense'::text), 0::numeric) AS actual_expense,
            COALESCE(sum(bi.amount) FILTER (WHERE bb.bucket_kind = 'saving'::text), 0::numeric) AS actual_saving,
            COALESCE(sum(bi.amount) FILTER (WHERE bb.bucket_kind = 'investment'::text), 0::numeric) AS actual_investment,
            COALESCE(sum(bi.amount) FILTER (WHERE bb.bucket_kind = 'debt'::text), 0::numeric) AS actual_debt
           FROM budget_impacts bi
             JOIN budget_buckets bb ON bb.id = bi.budget_bucket_id
             JOIN journal_entries je ON je.id = bi.entry_id
             JOIN periods p_1 ON p_1.id = bi.budget_period_id
          WHERE je.status = 'confirmed'::text AND je.occurred_at >= p_1.period_start_at AND je.occurred_at < p_1.period_end_exclusive AND je.occurred_at <= now()
          GROUP BY bi.budget_period_id
        ), actual_total_expense AS (
         SELECT p_1.id AS budget_period_id,
            COALESCE(sum(abs(jl.amount)), 0::numeric) AS actual_total_expense
           FROM periods p_1
             JOIN journal_entries je ON je.entry_type = 'expense'::text AND je.status = 'confirmed'::text AND je.occurred_at >= p_1.period_start_at AND je.occurred_at < p_1.period_end_exclusive AND je.occurred_at <= now()
             JOIN journal_lines jl ON jl.entry_id = je.id
          GROUP BY p_1.id
        ), actual_income AS (
         SELECT p_1.id AS budget_period_id,
            COALESCE(sum(jl.amount), 0::numeric) AS actual_income
           FROM periods p_1
             JOIN journal_entries je ON je.status = 'confirmed'::text AND je.occurred_at >= p_1.period_start_at AND je.occurred_at < p_1.period_end_exclusive AND je.occurred_at <= now()
             JOIN journal_lines jl ON jl.entry_id = je.id
             JOIN categories c ON c.id = jl.category_id AND c.category_type = 'income'::text
          GROUP BY p_1.id
        ), net_worth AS (
         SELECT p_1.id AS budget_period_id,
                CASE
                    WHEN count(*) FILTER (WHERE a.include_in_net_worth = true AND start_snapshot.snapshot_at IS NULL) > 0 THEN NULL::numeric
                    ELSE sum(
                    CASE
                        WHEN a.include_in_net_worth = false THEN 0::numeric
                        WHEN a.account_class = 'asset'::text THEN start_snapshot.balance + COALESCE(start_changes.amount, 0::numeric)
                        WHEN a.account_class = 'liability'::text THEN - (start_snapshot.balance + COALESCE(start_changes.amount, 0::numeric))
                        ELSE 0::numeric
                    END)
                END AS net_worth_start,
                CASE
                    WHEN count(*) FILTER (WHERE a.include_in_net_worth = true AND current_snapshot.snapshot_at IS NULL) > 0 THEN NULL::numeric
                    ELSE sum(
                    CASE
                        WHEN a.include_in_net_worth = false THEN 0::numeric
                        WHEN a.account_class = 'asset'::text THEN current_snapshot.balance + COALESCE(current_changes.amount, 0::numeric)
                        WHEN a.account_class = 'liability'::text THEN - (current_snapshot.balance + COALESCE(current_changes.amount, 0::numeric))
                        ELSE 0::numeric
                    END)
                END AS net_worth_as_of,
            count(*) FILTER (WHERE a.include_in_net_worth = true AND start_snapshot.snapshot_at IS NULL) AS missing_start_snapshots,
            count(*) FILTER (WHERE a.include_in_net_worth = true AND current_snapshot.snapshot_at IS NULL) AS missing_current_snapshots
           FROM periods p_1
             CROSS JOIN accounts a
             LEFT JOIN LATERAL ( SELECT bs.snapshot_at,
                    bs.balance
                   FROM balance_snapshots bs
                  WHERE bs.account_id = a.id AND bs.snapshot_at <= p_1.period_start_at
                  ORDER BY bs.snapshot_at DESC
                 LIMIT 1) start_snapshot ON true
             LEFT JOIN LATERAL ( SELECT sum(jl.amount) AS amount
                   FROM journal_lines jl
                     JOIN journal_entries je ON je.id = jl.entry_id
                  WHERE jl.account_id = a.id AND je.status = 'confirmed'::text AND start_snapshot.snapshot_at IS NOT NULL AND je.occurred_at > start_snapshot.snapshot_at AND je.occurred_at <= p_1.period_start_at) start_changes ON true
             LEFT JOIN LATERAL ( SELECT bs.snapshot_at,
                    bs.balance
                   FROM balance_snapshots bs
                  WHERE bs.account_id = a.id AND bs.snapshot_at <= p_1.summary_as_of
                  ORDER BY bs.snapshot_at DESC
                 LIMIT 1) current_snapshot ON true
             LEFT JOIN LATERAL ( SELECT sum(jl.amount) AS amount
                   FROM journal_lines jl
                     JOIN journal_entries je ON je.id = jl.entry_id
                  WHERE jl.account_id = a.id AND je.status = 'confirmed'::text AND current_snapshot.snapshot_at IS NOT NULL AND je.occurred_at > current_snapshot.snapshot_at AND je.occurred_at <= p_1.summary_as_of) current_changes ON true
          GROUP BY p_1.id
        )
 SELECT p.id AS budget_period_id,
    p.start_date,
    p.end_date,
    p.status,
    p.currency,
    p.summary_as_of,
    p.planned_income,
    COALESCE(ai.actual_income, 0::numeric) AS actual_income,
    COALESCE(pl.planned_total_allocated, 0::numeric) AS planned_total_allocated,
    p.planned_income - COALESCE(pl.planned_total_allocated, 0::numeric) AS planned_unallocated,
    COALESCE(pl.planned_expense, 0::numeric) AS planned_expense,
    COALESCE(pl.planned_saving, 0::numeric) AS planned_saving,
    COALESCE(pl.planned_investment, 0::numeric) AS planned_investment,
    COALESCE(pl.planned_debt, 0::numeric) AS planned_debt,
    COALESCE(ab.actual_expense, 0::numeric) AS actual_expense,
    COALESCE(ab.actual_saving, 0::numeric) AS actual_saving,
    COALESCE(ab.actual_investment, 0::numeric) AS actual_investment,
    COALESCE(ab.actual_debt, 0::numeric) AS actual_debt,
    COALESCE(ai.actual_income, 0::numeric) - COALESCE(ab.actual_expense, 0::numeric) - COALESCE(ab.actual_saving, 0::numeric) - COALESCE(ab.actual_investment, 0::numeric) - COALESCE(ab.actual_debt, 0::numeric) AS actual_unallocated,
    COALESCE(ab.actual_expense, 0::numeric) - COALESCE(pl.planned_expense, 0::numeric) AS expense_variance,
        CASE
            WHEN COALESCE(ai.actual_income, 0::numeric) > 0::numeric THEN round(COALESCE(ab.actual_saving, 0::numeric) / ai.actual_income * 100::numeric, 2)
            ELSE NULL::numeric
        END AS saving_rate,
    nw.net_worth_start,
    nw.net_worth_as_of,
        CASE
            WHEN nw.net_worth_start IS NOT NULL AND nw.net_worth_as_of IS NOT NULL THEN nw.net_worth_as_of - nw.net_worth_start
            ELSE NULL::numeric
        END AS net_worth_change,
    nw.missing_start_snapshots,
    nw.missing_current_snapshots,
    COALESCE(ate.actual_total_expense, 0::numeric) AS actual_total_expense
   FROM periods p
     LEFT JOIN planned pl ON pl.budget_period_id = p.id
     LEFT JOIN actual_budget ab ON ab.budget_period_id = p.id
     LEFT JOIN actual_total_expense ate ON ate.budget_period_id = p.id
     LEFT JOIN actual_income ai ON ai.budget_period_id = p.id
     LEFT JOIN net_worth nw ON nw.budget_period_id = p.id;
grant select on public.vw_monthly_financial_summary to authenticated;

create or replace function public.save_monthly_budget(
  p_month date,
  p_planned_income numeric,
  p_allocations jsonb,
  p_period_id uuid default null,
  p_expected_updated_at timestamptz default null
)
returns table (
  budget_period_id uuid,
  period_status text,
  period_updated_at timestamptz,
  planned_total_allocated numeric,
  planned_unallocated numeric,
  backfilled_count integer,
  pending_transaction_count integer,
  warning_codes text[]
)
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_period public.budget_periods%rowtype;
  v_end_date date;
  v_item jsonb;
  v_bucket_id uuid;
  v_amount numeric;
  v_bucket_active boolean;
  v_existing_amount numeric;
  v_bucket_ids uuid[] := array[]::uuid[];
  v_total numeric := 0;
  v_warnings text[] := array[]::text[];
  v_backfilled integer := 0;
  v_pending integer := 0;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  perform pg_advisory_xact_lock(1782, 1);

  if p_month is null or not isfinite(p_month) then
    raise exception using errcode = '22023', message = 'invalid_budget_month';
  end if;
  if extract(day from p_month) <> 1 then
    raise exception using errcode = '22023', message = 'budget_month_must_start_on_first';
  end if;
  v_end_date := (p_month + interval '1 month' - interval '1 day')::date;

  if p_planned_income is null
    or p_planned_income::text in ('NaN', 'Infinity', '-Infinity')
    or p_planned_income < 0 or p_planned_income > 999999999999.99
    or p_planned_income <> round(p_planned_income, 2) then
    raise exception using errcode = '22023', message = 'invalid_planned_income';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_budget_allocations';
  end if;
  if jsonb_array_length(p_allocations) = 0 then
    raise exception using errcode = '22023', message = 'budget_allocations_required';
  end if;

  -- All three application RPCs take the advisory lock FIRST. Budget save also
  -- stabilizes tables for the no-duplicate and period overlap checks.
  -- Single-user scope: writes can wait briefly; ordinary reads remain possible.
  -- Direct table writers do not follow the advisory protocol; lock timeout /
  -- deadlock errors must roll back and be surfaced, not ignored.
  lock table public.journal_entries in share row exclusive mode;
  lock table public.journal_lines in share mode;
  lock table public.budget_impacts in share row exclusive mode;
  lock table public.budget_periods in share row exclusive mode;
  lock table public.budget_allocations in share row exclusive mode;
  lock table public.accounts in share mode;
  lock table public.categories in share mode;
  lock table public.budget_buckets in share mode;

  if p_period_id is null then
    if p_expected_updated_at is not null then
      raise exception using errcode = '22023', message = 'unexpected_budget_version';
    end if;
  else
    select bp.* into v_period
    from public.budget_periods bp where bp.id = p_period_id for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'budget_period_not_found';
    end if;
    if v_period.status = 'closed' then
      raise exception using errcode = 'P0001', message = 'budget_period_closed';
    end if;
    if v_period.currency <> 'CNY' then
      raise exception using errcode = 'P0001', message = 'unsupported_budget_currency';
    end if;
    if v_period.start_date <> p_month or v_period.end_date <> v_end_date then
      raise exception using errcode = '22023', message = 'budget_dates_immutable';
    end if;
    if p_expected_updated_at is null
      or p_expected_updated_at is distinct from v_period.updated_at then
      raise exception using errcode = 'P0001', message = 'budget_version_conflict';
    end if;
    if v_period.status <> 'active' then
      -- Do not silently activate legacy draft data as part of this rollout.
      raise exception using errcode = 'P0001', message = 'legacy_draft_requires_review';
    end if;
  end if;

  if exists (
    select 1 from public.budget_periods bp
    where bp.start_date <= v_end_date and bp.end_date >= p_month
      and (p_period_id is null or bp.id <> p_period_id)
  ) then
    raise exception using errcode = 'P0001', message = 'overlapping_budget_periods';
  end if;

  for v_item in select value from jsonb_array_elements(p_allocations)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item -> 'budget_bucket_id') is distinct from 'string'
      or jsonb_typeof(v_item -> 'planned_amount') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'invalid_budget_allocation';
    end if;
    begin
      v_bucket_id := (v_item ->> 'budget_bucket_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_budget_bucket_id';
    end;
    v_amount := (v_item ->> 'planned_amount')::numeric;
    if v_amount < 0 or v_amount > 999999999999.99
      or v_amount <> round(v_amount, 2) then
      raise exception using errcode = '22023', message = 'invalid_planned_amount';
    end if;
    if v_bucket_id = any(v_bucket_ids) then
      raise exception using errcode = '22023', message = 'duplicate_budget_bucket';
    end if;
    v_bucket_ids := array_append(v_bucket_ids, v_bucket_id);

    select bb.is_active into v_bucket_active
    from public.budget_buckets bb where bb.id = v_bucket_id;
    if not found then
      raise exception using errcode = '22023', message = 'budget_bucket_not_found';
    end if;
    if not v_bucket_active then
      select ba.planned_amount into v_existing_amount
      from public.budget_allocations ba
      where ba.budget_period_id = p_period_id and ba.budget_bucket_id = v_bucket_id;
      -- Preserve existing disabled buckets as read-only, never create or change.
      if not found or v_existing_amount is distinct from v_amount then
        raise exception using errcode = '22023', message = 'inactive_budget_bucket';
      end if;
    end if;
    v_total := v_total + v_amount;
  end loop;

  -- Full snapshot: all active buckets plus any existing disabled allocations.
  -- IDs/names/count come from the DB, not six hardcoded names or fake amounts.
  if exists (
    select 1 from public.budget_buckets bb
    where bb.is_active and not (bb.id = any(v_bucket_ids))
  ) or exists (
    select 1 from public.budget_allocations ba
    where ba.budget_period_id = p_period_id
      and not (ba.budget_bucket_id = any(v_bucket_ids))
  ) then
    raise exception using errcode = '22023', message = 'incomplete_budget_allocations';
  end if;

  if p_period_id is null then
    insert into public.budget_periods (
      start_date, end_date, planned_income, currency, status
    ) values (p_month, v_end_date, p_planned_income, 'CNY', 'active')
    returning * into v_period;
  else
    update public.budget_periods bp
    set planned_income = p_planned_income
    where bp.id = p_period_id
    returning bp.* into v_period;
  end if;

  insert into public.budget_allocations (
    budget_period_id, budget_bucket_id, planned_amount
  )
  select v_period.id, (item.value ->> 'budget_bucket_id')::uuid,
    (item.value ->> 'planned_amount')::numeric
  from jsonb_array_elements(p_allocations) item
  join public.budget_buckets bb on bb.id = (item.value ->> 'budget_bucket_id')::uuid
  where bb.is_active
  on conflict on constraint budget_allocations_period_bucket_unique
  do update set planned_amount = excluded.planned_amount;
  -- Existing allocation ids/notes and every actual budget impact are retained.

  -- Use PERSISTED transaction classification, never today's category default.
  -- Ordinary single-line manual expenses only. Unsupported/unknown legacy rows
  -- remain untouched and are included in the unresolved count below.
  insert into public.budget_impacts (
    entry_id, line_id, budget_period_id, budget_bucket_id, amount, source, note
  )
  select je.id, jl.id, v_period.id, jl.budget_bucket_id, abs(jl.amount), 'auto',
    'monthly_budget_save: automatic attribution from persisted transaction bucket'
  from public.journal_entries je
  join public.journal_lines jl on jl.entry_id = je.id
  join public.accounts a on a.id = jl.account_id
  join public.budget_allocations ba on ba.budget_period_id = v_period.id
    and ba.budget_bucket_id = jl.budget_bucket_id
  where je.entry_type = 'expense' and je.status = 'confirmed'
    and je.source = 'manual' and je.related_entry_id is null
    and not je.exclude_from_budget
    and je.occurred_at >= (p_month::timestamp at time zone 'Asia/Shanghai')
    and je.occurred_at < ((p_month + interval '1 month') at time zone 'Asia/Shanghai')
    and a.currency = v_period.currency
    and jl.amount::text not in ('NaN', 'Infinity', '-Infinity')
    and ((a.account_class = 'asset' and jl.amount < 0)
      or (a.account_class = 'liability' and jl.amount > 0))
    and (select count(*) from public.journal_lines other where other.entry_id = je.id) = 1
    and not exists (select 1 from public.budget_impacts bi where bi.entry_id = je.id);
  get diagnostics v_backfilled = row_count;

  select count(*)::integer into v_pending
  from public.journal_entries je
  where je.entry_type = 'expense' and je.status = 'confirmed'
    and not je.exclude_from_budget
    and je.occurred_at >= (p_month::timestamp at time zone 'Asia/Shanghai')
    and je.occurred_at < ((p_month + interval '1 month') at time zone 'Asia/Shanghai')
    and not exists (select 1 from public.budget_impacts bi where bi.entry_id = je.id);

  if v_total > p_planned_income then
    v_warnings := array_append(v_warnings, 'allocations_exceed_planned_income');
  end if;
  if v_pending > 0 then
    v_warnings := array_append(v_warnings, 'unassigned_transactions_remaining');
  end if;

  return query select v_period.id, v_period.status, v_period.updated_at,
    v_total, p_planned_income - v_total, v_backfilled, v_pending, v_warnings;
end;
$$;


create or replace view public.vw_transaction_details
with (security_invoker = true) as
select
  e.id as entry_id,
  e.occurred_at,
  e.entry_type,
  e.description,
  e.source,
  e.status,
  e.related_entry_id,
  l.id as line_id,
  l.sort_order as line_sort_order,
  l.amount,
  l.memo,
  a.id as account_id,
  a.name as account_name,
  a.account_class,
  a.account_type,
  a.institution,
  c.id as category_id,
  c.name as category_name,
  c.category_type,
  e.exclude_from_budget,
  impact.budget_period_id,
  bp.start_date as budget_period_start_date,
  bp.end_date as budget_period_end_date,
  impact.budget_bucket_id,
  bb.name as budget_bucket_name,
  l.budget_bucket_id as saved_budget_bucket_id,
  saved_bb.name as saved_budget_bucket_name
from public.journal_entries e
join public.journal_lines l on l.entry_id = e.id
join public.accounts a on a.id = l.account_id
left join public.categories c on c.id = l.category_id
left join lateral (
  select
    bi.budget_period_id,
    bi.budget_bucket_id
  from public.budget_impacts bi
  where bi.entry_id = e.id
    and (bi.line_id = l.id or (bi.line_id is null and l.sort_order = 0))
  order by
    case when bi.line_id = l.id then 0 else 1 end,
    bi.created_at,
    bi.id
  limit 1
) impact on true
left join public.budget_periods bp on bp.id = impact.budget_period_id
left join public.budget_buckets bb on bb.id = impact.budget_bucket_id
left join public.budget_buckets saved_bb on saved_bb.id = l.budget_bucket_id;



grant select on public.vw_transaction_details to authenticated;
revoke all on function public.save_monthly_budget(date,numeric,jsonb,uuid,timestamptz) from public,anon;
grant execute on function public.save_monthly_budget(date,numeric,jsonb,uuid,timestamptz) to authenticated;
