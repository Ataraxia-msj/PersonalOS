-- Run only against a disposable/local Supabase database after applying migrations.
-- All fixtures and writes are rolled back at the end.

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'assertion failed: %', p_message;
  end if;
end;
$$;

insert into public.accounts (id, name, account_class, account_type, is_active)
values
  ('11000000-0000-0000-0000-000000000001', '__edit_test_asset', 'asset', 'bank', true),
  ('11000000-0000-0000-0000-000000000002', '__edit_test_liability', 'liability', 'credit_card', true);

insert into public.budget_buckets (id, name, bucket_kind, is_active, sort_order)
values
  ('21000000-0000-0000-0000-000000000001', '__edit_test_food', 'expense', true, 0),
  ('21000000-0000-0000-0000-000000000002', '__edit_test_free', 'expense', true, 1);

insert into public.categories (
  id, name, category_type, default_budget_bucket_id, is_active, sort_order
)
values
  ('31000000-0000-0000-0000-000000000001', '__edit_test_meal', 'expense', '21000000-0000-0000-0000-000000000001', true, 0),
  ('31000000-0000-0000-0000-000000000002', '__edit_test_publishing', 'expense', null, true, 1);

insert into public.budget_periods (id, start_date, end_date, planned_income, status)
values
  ('41000000-0000-0000-0000-000000000001', '1998-01-01', '1998-01-31', 10000, 'active'),
  ('41000000-0000-0000-0000-000000000002', '1998-02-01', '1998-02-28', 10000, 'closed'),
  ('41000000-0000-0000-0000-000000000003', '1998-03-01', '1998-03-20', 10000, 'draft'),
  ('41000000-0000-0000-0000-000000000004', '1998-03-10', '1998-03-31', 10000, 'draft');

insert into public.budget_allocations (
  budget_period_id, budget_bucket_id, planned_amount
)
values
  ('41000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 1000),
  ('41000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', 500),
  ('41000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', 1000);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '91000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

-- Intentionally excluded expenses remain real monthly expenses but do not
-- consume a budget bucket.
do $$
declare
  v_result record;
  v_total_before numeric;
  v_total_after numeric;
  v_budget_before numeric;
  v_budget_after numeric;
begin
  select actual_total_expense into v_total_before
  from public.vw_monthly_financial_summary
  where budget_period_id = '41000000-0000-0000-0000-000000000001';

  select actual_amount into v_budget_before
  from public.vw_budget_execution
  where budget_period_id = '41000000-0000-0000-0000-000000000001'
    and budget_bucket_id = '21000000-0000-0000-0000-000000000001';

  select * into strict v_result
  from public.create_expense_transaction(
    '1998-01-10 12:00:00+08',
    '__edit_test_excluded',
    '11000000-0000-0000-0000-000000000001',
    10,
    '31000000-0000-0000-0000-000000000002',
    null,
    null,
    null,
    true
  );

  perform pg_temp.assert_true(v_result.budget_excluded, 'create must return intentional exclusion');
  perform pg_temp.assert_true(v_result.warning_code is null, 'intentional exclusion is not a warning');
  perform pg_temp.assert_true(not v_result.budget_impact_created, 'excluded create must not write impact');
  perform pg_temp.assert_true(not exists (
    select 1 from public.budget_impacts where entry_id = v_result.entry_id
  ), 'excluded entry must have no impact');

  select actual_total_expense into v_total_after
  from public.vw_monthly_financial_summary
  where budget_period_id = '41000000-0000-0000-0000-000000000001';

  select actual_amount into v_budget_after
  from public.vw_budget_execution
  where budget_period_id = '41000000-0000-0000-0000-000000000001'
    and budget_bucket_id = '21000000-0000-0000-0000-000000000001';

  perform pg_temp.assert_true(v_total_after - v_total_before = 10, 'excluded expense must enter monthly total');
  perform pg_temp.assert_true(v_budget_after = v_budget_before, 'excluded expense must not change budget execution');
end;
$$;

-- Editing an open-period included expense to excluded removes its old impact
-- and recalculates the liability-account sign.
do $$
declare
  v_created record;
  v_updated record;
  v_line_amount numeric;
  v_description text;
begin
  select * into strict v_created
  from public.create_expense_transaction(
    '1998-01-11 12:00:00+08', '__edit_test_open',
    '11000000-0000-0000-0000-000000000001', 11,
    '31000000-0000-0000-0000-000000000001', null, null, null, false
  );

  perform pg_temp.assert_true(v_created.budget_impact_created, 'included create should write impact');

  select * into strict v_updated
  from public.update_expense_transaction(
    v_created.entry_id,
    '1998-01-12 09:30:00+08',
    '__edit_test_open_edited',
    '11000000-0000-0000-0000-000000000002',
    20,
    '31000000-0000-0000-0000-000000000002',
    null,
    true,
    null,
    'edited memo'
  );

  select jl.amount, je.description
    into v_line_amount, v_description
  from public.journal_entries je
  join public.journal_lines jl on jl.entry_id = je.id
  where je.id = v_created.entry_id;

  perform pg_temp.assert_true(v_updated.budget_excluded, 'updated entry must be excluded');
  perform pg_temp.assert_true(not v_updated.budget_impact_created, 'excluded edit must not create impact');
  perform pg_temp.assert_true(v_line_amount = 20, 'liability expense must have positive line amount');
  perform pg_temp.assert_true(v_description = '__edit_test_open_edited', 'description must update');
  perform pg_temp.assert_true(not exists (
    select 1 from public.budget_impacts where entry_id = v_created.entry_id
  ), 'old open impact must be removed');
end;
$$;

-- A closed-period impact is immutable while entry facts remain editable.
do $$
declare
  v_entry_id uuid := '51000000-0000-0000-0000-000000000001';
  v_line_id uuid := '61000000-0000-0000-0000-000000000001';
  v_result record;
  v_impact_amount numeric;
  v_line_amount numeric;
  v_excluded boolean;
begin
  insert into public.journal_entries (
    id, occurred_at, entry_type, description, source, status, exclude_from_budget
  ) values (
    v_entry_id, '1998-02-10 12:00:00+08', 'expense', '__edit_test_closed',
    'manual', 'confirmed', false
  );

  insert into public.journal_lines (
    id, entry_id, account_id, amount, category_id, sort_order
  ) values (
    v_line_id, v_entry_id, '11000000-0000-0000-0000-000000000001', -5,
    '31000000-0000-0000-0000-000000000001', 0
  );

  insert into public.budget_impacts (
    entry_id, line_id, budget_period_id, budget_bucket_id, amount, source
  ) values (
    v_entry_id, v_line_id, '41000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000001', 5, 'manual'
  );

  select * into strict v_result
  from public.update_expense_transaction(
    v_entry_id, '1998-04-01 08:00:00+08', '__edit_test_closed_edited',
    '11000000-0000-0000-0000-000000000001', 7,
    '31000000-0000-0000-0000-000000000002', null, true, null, null
  );

  select amount into v_impact_amount
  from public.budget_impacts where entry_id = v_entry_id;
  select amount into v_line_amount
  from public.journal_lines where id = v_line_id;
  select exclude_from_budget into v_excluded
  from public.journal_entries where id = v_entry_id;

  perform pg_temp.assert_true(v_result.warning_code = 'budget_period_closed_preserved', 'closed impact must warn');
  perform pg_temp.assert_true(v_impact_amount = 5, 'closed impact amount must remain unchanged');
  perform pg_temp.assert_true(v_line_amount = -7, 'entry facts must still update');
  perform pg_temp.assert_true(not v_excluded, 'closed impact must preserve original exclusion state');
end;
$$;

-- Multi-line manual expenses are deliberately outside the edit scope.
do $$
declare
  v_entry_id uuid := '51000000-0000-0000-0000-000000000002';
  v_failed boolean := false;
begin
  insert into public.journal_entries (
    id, occurred_at, entry_type, description, source, status
  ) values (
    v_entry_id, '1998-01-15 12:00:00+08', 'expense', '__edit_test_multi', 'manual', 'confirmed'
  );
  insert into public.journal_lines (entry_id, account_id, amount, category_id, sort_order)
  values
    (v_entry_id, '11000000-0000-0000-0000-000000000001', -1, '31000000-0000-0000-0000-000000000001', 0),
    (v_entry_id, '11000000-0000-0000-0000-000000000001', -2, '31000000-0000-0000-0000-000000000001', 1);

  begin
    perform * from public.update_expense_transaction(
      v_entry_id, '1998-01-15 12:00:00+08', '__edit_test_multi_edited',
      '11000000-0000-0000-0000-000000000001', 3,
      '31000000-0000-0000-0000-000000000001', null, false, null, null
    );
  exception when others then
    v_failed := sqlerrm = 'expense_entry_must_have_exactly_one_line';
  end;

  perform pg_temp.assert_true(v_failed, 'multi-line expense must be rejected');
end;
$$;

-- Overlapping periods remain a data-integrity failure with no partial write.
do $$
declare
  v_failed boolean := false;
begin
  begin
    perform * from public.create_expense_transaction(
      '1998-03-15 12:00:00+08', '__edit_test_overlap',
      '11000000-0000-0000-0000-000000000001', 4,
      '31000000-0000-0000-0000-000000000001', null, null, null, false
    );
  exception when others then
    v_failed := sqlerrm = 'overlapping_budget_periods';
  end;

  perform pg_temp.assert_true(v_failed, 'overlap must fail');
  perform pg_temp.assert_true(not exists (
    select 1 from public.journal_entries where description = '__edit_test_overlap'
  ), 'overlap must not leave an entry');
end;
$$;

reset role;
set local role anon;

do $$
declare
  v_failed boolean := false;
begin
  begin
    perform * from public.update_expense_transaction(
      '51000000-0000-0000-0000-000000000001', now(), '__edit_test_anon',
      '11000000-0000-0000-0000-000000000001', 1,
      '31000000-0000-0000-0000-000000000001', null, false, null, null
    );
  exception when insufficient_privilege then
    v_failed := true;
  end;
  perform pg_temp.assert_true(v_failed, 'anon must not execute update RPC');
end;
$$;

reset role;

select 'expense editing and budget exclusion integration tests passed' as result;

rollback;
