-- Disposable database ONLY, with the real schema and the 202609080001 migration applied.
-- Run using psql -v ON_ERROR_STOP=1. Fixtures roll back; production is not a test target.
-- Prepared locally; not yet executed against PostgreSQL.
begin;

create function pg_temp.budget_assert(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.budget_assert(not has_function_privilege('anon',
  'public.save_monthly_budget(date,numeric,jsonb,uuid,timestamptz)', 'EXECUTE'), 'anon save denied');
select pg_temp.budget_assert(not has_function_privilege('anon',
  'public.create_expense_transaction(timestamptz,text,uuid,numeric,uuid,uuid,text,text,boolean)',
  'EXECUTE'), 'anon expense denied');

insert into public.accounts(id, name, account_class, account_type, currency)
values ('81000000-0000-0000-0000-000000000001', '__budget_v3_account', 'asset', 'bank', 'CNY'),
  ('81000000-0000-0000-0000-000000000002', '__budget_v3_foreign', 'asset', 'bank', 'USD');
insert into public.budget_buckets(id, name, bucket_kind, is_active)
values
  ('82000000-0000-0000-0000-000000000001', '__budget_v3_chosen', 'expense', true),
  ('82000000-0000-0000-0000-000000000002', '__budget_v3_default', 'expense', true);
insert into public.categories(id, name, category_type, default_budget_bucket_id, is_active)
values ('83000000-0000-0000-0000-000000000001', '__budget_v3_category', 'expense',
  '82000000-0000-0000-0000-000000000002', true);

-- Simulates RLS claims in a disposable DB, not a production login.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

do $$
declare
  chosen record;
  excluded record;
  unknown record;
  result record;
  saved_id uuid;
  saved_at timestamptz;
  allocations jsonb;
  before_lines jsonb;
  before_entries jsonb;
begin
  perform pg_temp.budget_assert(not exists(select 1 from public.budget_periods
    where start_date <= '2198-11-30' and end_date >= '2198-09-01'), 'test months must be empty');

  select * into chosen from public.create_expense_transaction(
    '2198-09-01 00:00:00+08', '__v3_chosen',
    '81000000-0000-0000-0000-000000000001', 2,
    '83000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001');
  perform pg_temp.budget_assert(chosen.warning_code = 'no_budget_period'
    and not chosen.budget_impact_created, 'no period is nonfatal');
  perform pg_temp.budget_assert((select budget_bucket_id = '82000000-0000-0000-0000-000000000001'
    from public.journal_lines where id = chosen.line_id), 'explicit bucket persisted without period');
  perform pg_temp.budget_assert((select saved_budget_bucket_id = '82000000-0000-0000-0000-000000000001'
    and budget_period_id is null from public.vw_transaction_details
    where line_id = chosen.line_id), 'view exposes saved choice without impact');

  -- Amount-only edit with NULL must preserve saved choice, not current default.
  perform public.update_expense_transaction(chosen.entry_id, '2198-09-02 12:00:00+08',
    '__v3_chosen_updated', '81000000-0000-0000-0000-000000000001', 7,
    '83000000-0000-0000-0000-000000000001', null, false, null, null);
  perform pg_temp.budget_assert((select budget_bucket_id = '82000000-0000-0000-0000-000000000001'
    and amount = -7 from public.journal_lines where id = chosen.line_id), 'edit preserves saved choice');

  select * into excluded from public.create_expense_transaction(
    '2198-09-03 12:00:00+08', '__v3_excluded',
    '81000000-0000-0000-0000-000000000001', 618,
    '83000000-0000-0000-0000-000000000001', null, null, null, true);
  perform pg_temp.budget_assert((select budget_bucket_id is null
    from public.journal_lines where id = excluded.line_id), 'excluded has no saved bucket');

  update public.categories set default_budget_bucket_id = null
    where id = '83000000-0000-0000-0000-000000000001';
  select * into unknown from public.create_expense_transaction(
    '2198-09-04 12:00:00+08', '__v3_unknown',
    '81000000-0000-0000-0000-000000000001', 3,
    '83000000-0000-0000-0000-000000000001');
  update public.categories set default_budget_bucket_id = '82000000-0000-0000-0000-000000000002'
    where id = '83000000-0000-0000-0000-000000000001';

  select jsonb_agg(to_jsonb(l) order by l.id) into before_lines from public.journal_lines l;
  select jsonb_agg(to_jsonb(e) order by e.id) into before_entries from public.journal_entries e;
  select jsonb_agg(jsonb_build_object('budget_bucket_id', b.id, 'planned_amount', 10) order by b.id)
    into allocations from public.budget_buckets b where b.is_active;
  select * into result from public.save_monthly_budget('2198-09-01', 5000, allocations);
  saved_id := result.budget_period_id;
  saved_at := result.period_updated_at;
  perform pg_temp.budget_assert(result.period_status = 'active' and result.backfilled_count = 1,
    'save activates and automatically attributes known expense');
  perform pg_temp.budget_assert(result.pending_transaction_count = 1, 'unknown reported, excluded not counted');
  perform pg_temp.budget_assert((select count(*) = 1 and min(amount) = 7
    from public.budget_impacts where entry_id = chosen.entry_id
      and budget_bucket_id = '82000000-0000-0000-0000-000000000001'), 'saved choice, not default; positive amount');
  perform pg_temp.budget_assert(not exists(select 1 from public.budget_impacts
    where entry_id in (excluded.entry_id, unknown.entry_id)), 'excluded/unknown are not guessed');
  perform pg_temp.budget_assert(before_lines = (select jsonb_agg(to_jsonb(l) order by l.id)
    from public.journal_lines l), 'automatic attribution leaves ledger unchanged');
  perform pg_temp.budget_assert(before_entries = (select jsonb_agg(to_jsonb(e) order by e.id)
    from public.journal_entries e), 'automatic attribution leaves entries unchanged');

  select * into result from public.save_monthly_budget('2198-09-01', 6000, allocations, saved_id, saved_at);
  perform pg_temp.budget_assert(result.backfilled_count = 0, 'repeat adjustment does not duplicate impact');

  -- Moving to a month with no budget preserves classification, removes old open impact.
  perform public.update_expense_transaction(chosen.entry_id, '2198-10-01 00:00:00+08',
    '__v3_moved', '81000000-0000-0000-0000-000000000001', 7,
    '83000000-0000-0000-0000-000000000001', null, false, null, null);
  perform pg_temp.budget_assert(not exists(select 1 from public.budget_impacts
    where entry_id = chosen.entry_id), 'old open impact removed on move');
  perform pg_temp.budget_assert((select budget_bucket_id = '82000000-0000-0000-0000-000000000001'
    from public.journal_lines where id = chosen.line_id), 'classification survives month move');
  select * into result from public.save_monthly_budget('2198-10-01', 5000, allocations);
  perform pg_temp.budget_assert(result.backfilled_count = 1, 'Shanghai next month attributes moved expense');

  -- Currency eligibility must not depend on whether the month was saved first.
  select * into chosen from public.create_expense_transaction(
    '2198-11-01 12:00:00+08', '__v3_foreign_before',
    '81000000-0000-0000-0000-000000000002', 2,
    '83000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001');
  select * into result from public.save_monthly_budget('2198-11-01', 5000, allocations);
  perform pg_temp.budget_assert(result.backfilled_count = 0 and result.pending_transaction_count = 1,
    'foreign currency stays unbudgeted when month is created later');
  select * into excluded from public.create_expense_transaction(
    '2198-11-02 12:00:00+08', '__v3_foreign_after',
    '81000000-0000-0000-0000-000000000002', 2,
    '83000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001');
  perform pg_temp.budget_assert(excluded.warning_code = 'budget_currency_mismatch'
    and not excluded.budget_impact_created, 'foreign currency after month save is also unbudgeted');
  select * into result from public.update_expense_transaction(chosen.entry_id, '2198-11-01 12:00:00+08',
    '__v3_foreign_edit', '81000000-0000-0000-0000-000000000002', 3,
    '83000000-0000-0000-0000-000000000001', null, false, null, null);
  perform pg_temp.budget_assert(result.warning_code = 'budget_currency_mismatch'
    and not result.budget_impact_created, 'edit uses same currency guard');
  perform pg_temp.budget_assert(not exists(select 1 from public.budget_impacts
    where entry_id in (chosen.entry_id, excluded.entry_id)), 'no unconverted foreign amounts in CNY budget');
end;
$$;

reset role;
rollback;
