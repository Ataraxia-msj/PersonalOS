-- Run only against a disposable/local Supabase database after applying migrations.
-- Every fixture and write is rolled back at the end.

begin;

create or replace function pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'assertion failed: %', p_message;
  end if;
end;
$$;

insert into public.accounts (
  id, name, account_class, account_type, is_active
)
values
  ('10000000-0000-0000-0000-000000000001', '__rpc_test_asset', 'asset', 'bank', true),
  ('10000000-0000-0000-0000-000000000002', '__rpc_test_liability', 'liability', 'credit_card', true),
  ('10000000-0000-0000-0000-000000000003', '__rpc_test_inactive', 'asset', 'bank', false);

insert into public.budget_buckets (
  id, name, bucket_kind, is_active, sort_order
)
values
  ('20000000-0000-0000-0000-000000000001', '__rpc_test_food', 'expense', true, 0),
  ('20000000-0000-0000-0000-000000000002', '__rpc_test_free', 'expense', true, 1),
  ('20000000-0000-0000-0000-000000000003', '__rpc_test_inactive', 'expense', false, 2),
  ('20000000-0000-0000-0000-000000000004', '__rpc_test_unallocated', 'expense', true, 3);

insert into public.categories (
  id, name, category_type, default_budget_bucket_id, is_active, sort_order
)
values
  ('30000000-0000-0000-0000-000000000001', '__rpc_test_meal', 'expense', '20000000-0000-0000-0000-000000000001', true, 0),
  ('30000000-0000-0000-0000-000000000002', '__rpc_test_uncategorized', 'expense', null, true, 1),
  ('30000000-0000-0000-0000-000000000003', '__rpc_test_income', 'income', null, true, 2),
  ('30000000-0000-0000-0000-000000000004', '__rpc_test_inactive', 'expense', null, false, 3),
  ('30000000-0000-0000-0000-000000000005', '__rpc_test_bad_default', 'expense', '20000000-0000-0000-0000-000000000003', true, 4),
  ('30000000-0000-0000-0000-000000000006', '__rpc_test_unallocated', 'expense', '20000000-0000-0000-0000-000000000004', true, 5);

insert into public.budget_periods (
  id, start_date, end_date, planned_income, status
)
values
  ('40000000-0000-0000-0000-000000000001', '2199-01-01', '2199-01-31', 10000, 'active'),
  ('40000000-0000-0000-0000-000000000002', '2199-02-01', '2199-02-28', 10000, 'closed'),
  ('40000000-0000-0000-0000-000000000003', '2199-03-01', '2199-03-20', 10000, 'draft'),
  ('40000000-0000-0000-0000-000000000004', '2199-03-10', '2199-03-31', 10000, 'draft');

insert into public.budget_allocations (
  budget_period_id, budget_bucket_id, planned_amount
)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1000),
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 800),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 1000);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '90000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

do $$
declare
  v_result record;
  v_line_amount numeric;
  v_line_sort integer;
  v_impact_amount numeric;
  v_impact_source text;
  v_entry_source text;
  v_entry_status text;
begin
  select * into strict v_result
  from public.create_expense_transaction(
    '2199-01-12 08:30:00+08',
    '  __rpc_test_asset_expense  ',
    '10000000-0000-0000-0000-000000000001',
    12.34,
    '30000000-0000-0000-0000-000000000001',
    null,
    'raw input',
    'meal memo'
  );

  perform pg_temp.assert_true(v_result.budget_impact_created, 'asset expense should create an impact');
  perform pg_temp.assert_true(v_result.warning_code is null, 'asset expense should not warn');
  perform pg_temp.assert_true(v_result.budget_bucket_id = '20000000-0000-0000-0000-000000000001', 'category default bucket should be used');

  select amount, sort_order
    into v_line_amount, v_line_sort
  from public.journal_lines
  where id = v_result.line_id;

  perform pg_temp.assert_true(v_line_amount = -12.34, 'asset line amount should be negative');
  perform pg_temp.assert_true(v_line_sort = 0, 'first line sort order should be zero');

  select amount, source
    into v_impact_amount, v_impact_source
  from public.budget_impacts
  where entry_id = v_result.entry_id
    and line_id = v_result.line_id;

  perform pg_temp.assert_true(v_impact_amount = 12.34, 'budget impact should be positive');
  perform pg_temp.assert_true(v_impact_source = 'manual', 'budget impact source should be manual');

  select source, status
    into v_entry_source, v_entry_status
  from public.journal_entries
  where id = v_result.entry_id;

  perform pg_temp.assert_true(v_entry_source = 'manual', 'entry source should be manual');
  perform pg_temp.assert_true(v_entry_status = 'confirmed', 'entry status should be confirmed');
end;
$$;

do $$
declare
  v_result record;
  v_line_amount numeric;
begin
  select * into strict v_result
  from public.create_expense_transaction(
    '2199-01-13 09:00:00+08',
    '__rpc_test_liability_expense',
    '10000000-0000-0000-0000-000000000002',
    42,
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    null,
    null
  );

  select amount into v_line_amount
  from public.journal_lines
  where id = v_result.line_id;

  perform pg_temp.assert_true(v_line_amount = 42, 'liability line amount should be positive');
  perform pg_temp.assert_true(v_result.budget_bucket_id = '20000000-0000-0000-0000-000000000002', 'explicit bucket should override category default');
end;
$$;

do $$
declare
  v_result record;
begin
  select * into strict v_result
  from public.create_expense_transaction(
    '2199-04-01 00:15:00+08',
    '__rpc_test_no_period',
    '10000000-0000-0000-0000-000000000001',
    1,
    '30000000-0000-0000-0000-000000000001',
    null,
    null,
    null
  );

  perform pg_temp.assert_true(v_result.warning_code = 'no_budget_period', 'missing period should warn');
  perform pg_temp.assert_true(not v_result.budget_impact_created, 'missing period should not create impact');
  perform pg_temp.assert_true(not exists (
    select 1 from public.budget_impacts where entry_id = v_result.entry_id
  ), 'missing period must leave no impact');
end;
$$;

do $$
declare
  v_result record;
begin
  select * into strict v_result
  from public.create_expense_transaction(
    '2199-01-15 13:00:00+08',
    '__rpc_test_no_bucket',
    '10000000-0000-0000-0000-000000000001',
    2,
    '30000000-0000-0000-0000-000000000002',
    null,
    null,
    null
  );

  perform pg_temp.assert_true(v_result.warning_code = 'no_budget_bucket', 'missing bucket should warn');
  perform pg_temp.assert_true(not v_result.budget_impact_created, 'missing bucket should not create impact');
end;
$$;

do $$
declare
  v_result record;
begin
  select * into strict v_result
  from public.create_expense_transaction(
    '2199-02-10 12:00:00+08',
    '__rpc_test_closed_period',
    '10000000-0000-0000-0000-000000000001',
    3,
    '30000000-0000-0000-0000-000000000001',
    null,
    null,
    null
  );

  perform pg_temp.assert_true(v_result.warning_code = 'budget_period_closed', 'closed period should warn');
  perform pg_temp.assert_true(not v_result.budget_impact_created, 'closed period should not create impact');
end;
$$;

do $$
declare
  v_entries_before bigint;
  v_lines_before bigint;
  v_impacts_before bigint;
  v_failed boolean := false;
begin
  select count(*) into v_entries_before from public.journal_entries;
  select count(*) into v_lines_before from public.journal_lines;
  select count(*) into v_impacts_before from public.budget_impacts;

  begin
    perform * from public.create_expense_transaction(
      '2199-03-15 12:00:00+08',
      '__rpc_test_overlap',
      '10000000-0000-0000-0000-000000000001',
      4,
      '30000000-0000-0000-0000-000000000001',
      null,
      null,
      null
    );
  exception when others then
    v_failed := sqlerrm = 'overlapping_budget_periods';
  end;

  perform pg_temp.assert_true(v_failed, 'overlapping periods should fail');
  perform pg_temp.assert_true((select count(*) from public.journal_entries) = v_entries_before, 'overlap must not create entry');
  perform pg_temp.assert_true((select count(*) from public.journal_lines) = v_lines_before, 'overlap must not create line');
  perform pg_temp.assert_true((select count(*) from public.budget_impacts) = v_impacts_before, 'overlap must not create impact');
end;
$$;

do $$
declare
  v_failed boolean := false;
begin
  begin
    perform * from public.create_expense_transaction(
      '2199-04-01 12:00:00+08',
      '__rpc_test_bad_bucket_no_period',
      '10000000-0000-0000-0000-000000000001',
      5,
      '30000000-0000-0000-0000-000000000001',
      '29999999-9999-9999-9999-999999999999',
      null,
      null
    );
  exception when others then
    v_failed := sqlerrm = 'budget_bucket_not_found_or_inactive';
  end;

  perform pg_temp.assert_true(v_failed, 'invalid explicit bucket must fail before period lookup');
  perform pg_temp.assert_true(not exists (
    select 1 from public.journal_entries where description = '__rpc_test_bad_bucket_no_period'
  ), 'invalid explicit bucket must roll back the entry');
end;
$$;

do $$
declare
  v_failed boolean := false;
begin
  begin
    perform * from public.create_expense_transaction(
      '2199-01-20 12:00:00+08',
      '__rpc_test_unallocated',
      '10000000-0000-0000-0000-000000000001',
      6,
      '30000000-0000-0000-0000-000000000006',
      null,
      null,
      null
    );
  exception when others then
    v_failed := sqlerrm = 'category_default_bucket_not_allocated_to_period';
  end;

  perform pg_temp.assert_true(v_failed, 'unallocated default bucket should fail');
  perform pg_temp.assert_true(not exists (
    select 1 from public.journal_entries where description = '__rpc_test_unallocated'
  ), 'unallocated bucket must roll back the entry');
end;
$$;

do $$
declare
  v_failed boolean := false;
begin
  begin
    perform * from public.create_expense_transaction(
      '2199-01-20 12:00:00+08',
      '__rpc_test_inactive_account',
      '10000000-0000-0000-0000-000000000003',
      7,
      '30000000-0000-0000-0000-000000000001',
      null,
      null,
      null
    );
  exception when others then
    v_failed := sqlerrm = 'account_not_found_or_inactive';
  end;

  perform pg_temp.assert_true(v_failed, 'inactive account should fail');
end;
$$;

do $$
declare
  v_failed boolean := false;
begin
  begin
    perform * from public.create_expense_transaction(
      '2199-01-20 12:00:00+08',
      '__rpc_test_income_category',
      '10000000-0000-0000-0000-000000000001',
      8,
      '30000000-0000-0000-0000-000000000003',
      null,
      null,
      null
    );
  exception when others then
    v_failed := sqlerrm = 'expense_category_not_found_or_inactive';
  end;

  perform pg_temp.assert_true(v_failed, 'income category should fail');
end;
$$;

reset role;
set local role anon;

do $$
declare
  v_failed boolean := false;
begin
  begin
    perform * from public.create_expense_transaction(
      now(),
      '__rpc_test_anon',
      '10000000-0000-0000-0000-000000000001',
      1,
      '30000000-0000-0000-0000-000000000001',
      null,
      null,
      null
    );
  exception when insufficient_privilege then
    v_failed := true;
  end;

  perform pg_temp.assert_true(v_failed, 'anon must not have execute permission');
end;
$$;

reset role;

-- Force the final insert to fail and prove entry + line are rolled back too.
create or replace function pg_temp.reject_rpc_test_budget_impact()
returns trigger
language plpgsql
as $$
begin
  if new.note = '__rpc_force_failure' then
    raise exception 'forced_budget_impact_failure';
  end if;
  return new;
end;
$$;

create trigger rpc_test_reject_budget_impact
before insert on public.budget_impacts
for each row
when (new.source = 'manual')
execute function pg_temp.reject_rpc_test_budget_impact();

-- The production RPC does not write the sentinel note, so use a temporary
-- trigger that rejects the next test entry by looking up its description.
create or replace function pg_temp.reject_named_rpc_test_budget_impact()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.journal_entries je
    where je.id = new.entry_id
      and je.description = '__rpc_test_forced_impact_failure'
  ) then
    raise exception 'forced_budget_impact_failure';
  end if;
  return new;
end;
$$;

drop trigger rpc_test_reject_budget_impact on public.budget_impacts;

create trigger rpc_test_reject_budget_impact
before insert on public.budget_impacts
for each row
execute function pg_temp.reject_named_rpc_test_budget_impact();

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '90000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

do $$
declare
  v_failed boolean := false;
begin
  begin
    perform * from public.create_expense_transaction(
      '2199-01-25 12:00:00+08',
      '__rpc_test_forced_impact_failure',
      '10000000-0000-0000-0000-000000000001',
      9,
      '30000000-0000-0000-0000-000000000001',
      null,
      null,
      null
    );
  exception when others then
    v_failed := sqlerrm = 'forced_budget_impact_failure';
  end;

  perform pg_temp.assert_true(v_failed, 'forced impact failure should propagate');
  perform pg_temp.assert_true(not exists (
    select 1 from public.journal_entries where description = '__rpc_test_forced_impact_failure'
  ), 'impact failure must roll back entry');
  perform pg_temp.assert_true(not exists (
    select 1
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    where je.description = '__rpc_test_forced_impact_failure'
  ), 'impact failure must roll back line');
end;
$$;

reset role;

select 'create_expense_transaction integration tests passed' as result;

rollback;
