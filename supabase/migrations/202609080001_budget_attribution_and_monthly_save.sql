-- Approved v3: independent transaction attribution and direct monthly budget save.
-- Prepared locally; validate in an isolated database before production deployment.
-- Run once, after 202609050002. All changes below form a single transaction.
begin;
set local lock_timeout = '5s';

alter table public.journal_lines
  add column budget_bucket_id uuid
  constraint journal_lines_budget_bucket_id_fkey
  references public.budget_buckets(id) on delete restrict;

comment on column public.journal_lines.budget_bucket_id is
'Persisted transaction budget classification, independent of monthly budget existence. NULL is unresolved (or entry is explicitly excluded). Never infer historical values from current category defaults.';

-- Backfill only unambiguous EXISTING attribution for confirmed expense lines.
-- For legacy null line_id, only a single-line entry at sort_order 0 is eligible.
-- Do not infer from categories. Do not touch excluded entries or old impacts.
with known as (
  select jl.id as line_id, (array_agg(distinct bi.budget_bucket_id))[1] as bucket_id
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id
  join public.budget_impacts bi on bi.entry_id = je.id
    and (bi.line_id = jl.id or (bi.line_id is null and jl.sort_order = 0
      and (select count(*) from public.journal_lines other where other.entry_id = je.id) = 1))
  where je.entry_type = 'expense' and je.status = 'confirmed'
    and not je.exclude_from_budget
  group by jl.id
  having count(distinct bi.budget_bucket_id) = 1
)
update public.journal_lines jl
set budget_bucket_id = known.bucket_id
from known where known.line_id = jl.id;
-- Existing updated_at triggers run normally. No balances or amounts change.

create or replace function public.create_expense_transaction(
  p_occurred_at timestamptz,
  p_description text,
  p_account_id uuid,
  p_amount numeric,
  p_category_id uuid,
  p_budget_bucket_id uuid default null,
  p_raw_text text default null,
  p_memo text default null,
  p_exclude_from_budget boolean default false
)
returns table (
  entry_id uuid,
  line_id uuid,
  budget_impact_created boolean,
  budget_period_id uuid,
  budget_bucket_id uuid,
  budget_excluded boolean,
  warning_code text
)
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '5s'
as $function$
declare
  v_account_class text;
  v_account_currency text;
  v_default_bucket_id uuid;
  v_resolved_bucket_id uuid;
  v_occurred_date date;
  v_period_ids uuid[];
  v_period_count integer;
  v_period_id uuid;
  v_period_status text;
  v_period_currency text;
  v_entry_id uuid;
  v_line_id uuid;
  v_line_amount numeric;
  v_excluded boolean := coalesce(p_exclude_from_budget, false);
  v_budget_impact_created boolean := false;
  v_warning_code text := null;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  -- Shared with monthly budget save, before any account/entry/period locks.
  perform pg_advisory_xact_lock(1782, 1);
  if p_occurred_at is null then
    raise exception using errcode = '22023', message = 'occurred_at_required';
  end if;
  if p_description is null or btrim(p_description) = '' then
    raise exception using errcode = '22023', message = 'description_required';
  end if;
  if p_account_id is null then
    raise exception using errcode = '22023', message = 'account_id_required';
  end if;
  if p_category_id is null then
    raise exception using errcode = '22023', message = 'category_id_required';
  end if;
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'amount_must_be_positive';
  end if;
  if p_amount <> round(p_amount, 2) then
    raise exception using errcode = '22023', message = 'amount_must_have_at_most_two_decimal_places';
  end if;
  if p_amount > 999999999999.99 then
    raise exception using errcode = '22003', message = 'amount_out_of_range';
  end if;

  select a.account_class, a.currency into v_account_class, v_account_currency
  from public.accounts a
  where a.id = p_account_id and a.is_active = true
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'account_not_found_or_inactive';
  end if;
  if v_account_class not in ('asset', 'liability') then
    raise exception using errcode = 'P0001', message = 'unsupported_account_class';
  end if;

  select c.default_budget_bucket_id into v_default_bucket_id
  from public.categories c
  where c.id = p_category_id
    and c.is_active = true
    and c.category_type = 'expense'
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'expense_category_not_found_or_inactive';
  end if;

  if not v_excluded then
    v_resolved_bucket_id := coalesce(p_budget_bucket_id, v_default_bucket_id);
    if v_resolved_bucket_id is not null then
      perform 1 from public.budget_buckets bb
      where bb.id = v_resolved_bucket_id and bb.is_active = true
      for share;
      if not found then
        raise exception using
          errcode = 'P0001',
          message = case
            when p_budget_bucket_id is not null then 'budget_bucket_not_found_or_inactive'
            else 'category_default_budget_bucket_not_found_or_inactive'
          end;
      end if;
    end if;

    v_occurred_date := (p_occurred_at at time zone 'Asia/Shanghai')::date;
    select array_agg(bp.id order by bp.start_date, bp.end_date, bp.id)
      into v_period_ids
    from public.budget_periods bp
    where v_occurred_date between bp.start_date and bp.end_date;
    v_period_count := coalesce(cardinality(v_period_ids), 0);

    if v_period_count > 1 then
      raise exception using errcode = 'P0001', message = 'overlapping_budget_periods';
    elsif v_period_count = 0 then
      v_warning_code := 'no_budget_period';
    else
      v_period_id := v_period_ids[1];
      select bp.status, bp.currency into v_period_status, v_period_currency
      from public.budget_periods bp where bp.id = v_period_id
      for share;
      if not found then
        raise exception using errcode = 'P0001', message = 'budget_period_changed_during_transaction';
      elsif v_period_status = 'closed' then
        v_warning_code := 'budget_period_closed';
      elsif v_account_currency is distinct from v_period_currency then
        v_warning_code := 'budget_currency_mismatch';
      elsif v_resolved_bucket_id is null then
        v_warning_code := 'no_budget_bucket';
      else
        perform 1 from public.budget_allocations ba
        where ba.budget_period_id = v_period_id
          and ba.budget_bucket_id = v_resolved_bucket_id
        for share;
        if not found then
          raise exception using
            errcode = 'P0001',
            message = case
              when p_budget_bucket_id is not null then 'budget_bucket_not_allocated_to_period'
              else 'category_default_bucket_not_allocated_to_period'
            end;
        end if;
      end if;
    end if;
  end if;

  v_line_amount := case v_account_class
    when 'asset' then -p_amount
    when 'liability' then p_amount
  end;

  insert into public.journal_entries (
    occurred_at, entry_type, description, source, raw_text, status, exclude_from_budget
  ) values (
    p_occurred_at, 'expense', btrim(p_description), 'manual',
    nullif(btrim(p_raw_text), ''), 'confirmed', v_excluded
  ) returning id into v_entry_id;

  insert into public.journal_lines (
    entry_id, account_id, amount, category_id, memo, sort_order, budget_bucket_id
  ) values (
    v_entry_id, p_account_id, v_line_amount, p_category_id,
    nullif(btrim(p_memo), ''), 0, v_resolved_bucket_id
  ) returning id into v_line_id;

  if not v_excluded and v_warning_code is null then
    insert into public.budget_impacts (
      entry_id, line_id, budget_period_id, budget_bucket_id, amount, source
    ) values (
      v_entry_id, v_line_id, v_period_id, v_resolved_bucket_id, p_amount, 'manual'
    );
    v_budget_impact_created := true;
  end if;

  return query select
    v_entry_id, v_line_id, v_budget_impact_created, v_period_id,
    v_resolved_bucket_id, v_excluded, v_warning_code;
end;
$function$;

create or replace function public.update_expense_transaction(
  p_entry_id uuid,
  p_occurred_at timestamptz,
  p_description text,
  p_account_id uuid,
  p_amount numeric,
  p_category_id uuid,
  p_budget_bucket_id uuid,
  p_exclude_from_budget boolean,
  p_raw_text text,
  p_memo text
)
returns table (
  entry_id uuid,
  line_id uuid,
  budget_impact_created boolean,
  budget_period_id uuid,
  budget_bucket_id uuid,
  budget_excluded boolean,
  warning_code text
)
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '5s'
as $function$
declare
  v_entry_type text;
  v_entry_status text;
  v_entry_source text;
  v_existing_excluded boolean;
  v_saved_bucket_id uuid;
  v_existing_category_id uuid;
  v_line_ids uuid[];
  v_line_id uuid;
  v_impact_ids uuid[];
  v_old_impact_id uuid;
  v_old_period_id uuid;
  v_old_bucket_id uuid;
  v_old_period_status text;
  v_closed_impact boolean := false;
  v_account_class text;
  v_account_currency text;
  v_default_bucket_id uuid;
  v_resolved_bucket_id uuid;
  v_occurred_date date;
  v_period_ids uuid[];
  v_period_count integer;
  v_period_id uuid;
  v_period_status text;
  v_period_currency text;
  v_line_amount numeric;
  v_excluded boolean;
  v_budget_impact_created boolean := false;
  v_warning_code text := null;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  -- Shared with monthly budget save, before any account/entry/period locks.
  perform pg_advisory_xact_lock(1782, 1);
  if p_entry_id is null then
    raise exception using errcode = '22023', message = 'entry_id_required';
  end if;

  select je.entry_type, je.status, je.source, je.exclude_from_budget
    into v_entry_type, v_entry_status, v_entry_source, v_existing_excluded
  from public.journal_entries je
  where je.id = p_entry_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'expense_entry_not_found';
  end if;
  if v_entry_type <> 'expense' or v_entry_status <> 'confirmed' or v_entry_source <> 'manual' then
    raise exception using errcode = 'P0001', message = 'expense_entry_not_editable';
  end if;

  select array_agg(locked_line.id order by locked_line.sort_order, locked_line.id)
    into v_line_ids
  from (
    select jl.id, jl.sort_order
    from public.journal_lines jl
    where jl.entry_id = p_entry_id
    for update
  ) locked_line;
  if coalesce(cardinality(v_line_ids), 0) <> 1 then
    raise exception using errcode = 'P0001', message = 'expense_entry_must_have_exactly_one_line';
  end if;
  v_line_id := v_line_ids[1];
  select jl.budget_bucket_id, jl.category_id
    into v_saved_bucket_id, v_existing_category_id
  from public.journal_lines jl where jl.id = v_line_id;

  select array_agg(locked_impact.id order by locked_impact.id)
    into v_impact_ids
  from (
    select bi.id
    from public.budget_impacts bi
    where bi.entry_id = p_entry_id
    for update
  ) locked_impact;
  if coalesce(cardinality(v_impact_ids), 0) > 1 then
    raise exception using errcode = 'P0001', message = 'expense_entry_has_multiple_budget_impacts';
  end if;

  if cardinality(v_impact_ids) = 1 then
    v_old_impact_id := v_impact_ids[1];
    select bi.budget_period_id, bi.budget_bucket_id, bp.status
      into v_old_period_id, v_old_bucket_id, v_old_period_status
    from public.budget_impacts bi
    join public.budget_periods bp on bp.id = bi.budget_period_id
    where bi.id = v_old_impact_id
    for share of bp;
    if not found then
      raise exception using errcode = 'P0001', message = 'budget_impact_changed_during_transaction';
    end if;
    v_closed_impact := v_old_period_status = 'closed';
  end if;

  if p_occurred_at is null then
    raise exception using errcode = '22023', message = 'occurred_at_required';
  end if;
  if p_description is null or btrim(p_description) = '' then
    raise exception using errcode = '22023', message = 'description_required';
  end if;
  if p_account_id is null then
    raise exception using errcode = '22023', message = 'account_id_required';
  end if;
  if p_category_id is null then
    raise exception using errcode = '22023', message = 'category_id_required';
  end if;
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'amount_must_be_positive';
  end if;
  if p_amount <> round(p_amount, 2) then
    raise exception using errcode = '22023', message = 'amount_must_have_at_most_two_decimal_places';
  end if;
  if p_amount > 999999999999.99 then
    raise exception using errcode = '22003', message = 'amount_out_of_range';
  end if;

  select a.account_class, a.currency into v_account_class, v_account_currency
  from public.accounts a
  where a.id = p_account_id and a.is_active = true
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'account_not_found_or_inactive';
  end if;
  if v_account_class not in ('asset', 'liability') then
    raise exception using errcode = 'P0001', message = 'unsupported_account_class';
  end if;

  select c.default_budget_bucket_id into v_default_bucket_id
  from public.categories c
  where c.id = p_category_id
    and c.is_active = true
    and c.category_type = 'expense'
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'expense_category_not_found_or_inactive';
  end if;

  if v_closed_impact then
    v_excluded := v_existing_excluded;
    v_period_id := v_old_period_id;
    v_resolved_bucket_id := v_old_bucket_id;
    v_budget_impact_created := true;
    v_warning_code := 'budget_period_closed_preserved';
  else
    v_excluded := coalesce(p_exclude_from_budget, false);
    if not v_excluded then
      v_resolved_bucket_id := coalesce(p_budget_bucket_id,
        case when p_category_id = v_existing_category_id then v_saved_bucket_id end,
        v_default_bucket_id);
      if v_resolved_bucket_id is not null then
        perform 1 from public.budget_buckets bb
        where bb.id = v_resolved_bucket_id and bb.is_active = true
        for share;
        if not found then
          raise exception using
            errcode = 'P0001',
            message = case
              when p_budget_bucket_id is not null then 'budget_bucket_not_found_or_inactive'
              else 'category_default_budget_bucket_not_found_or_inactive'
            end;
        end if;
      end if;

      v_occurred_date := (p_occurred_at at time zone 'Asia/Shanghai')::date;
      select array_agg(bp.id order by bp.start_date, bp.end_date, bp.id)
        into v_period_ids
      from public.budget_periods bp
      where v_occurred_date between bp.start_date and bp.end_date;
      v_period_count := coalesce(cardinality(v_period_ids), 0);

      if v_period_count > 1 then
        raise exception using errcode = 'P0001', message = 'overlapping_budget_periods';
      elsif v_period_count = 0 then
        v_warning_code := 'no_budget_period';
      else
        v_period_id := v_period_ids[1];
        select bp.status, bp.currency into v_period_status, v_period_currency
        from public.budget_periods bp where bp.id = v_period_id
        for share;
        if not found then
          raise exception using errcode = 'P0001', message = 'budget_period_changed_during_transaction';
        elsif v_period_status = 'closed' then
          v_warning_code := 'budget_period_closed';
        elsif v_account_currency is distinct from v_period_currency then
          v_warning_code := 'budget_currency_mismatch';
        elsif v_resolved_bucket_id is null then
          v_warning_code := 'no_budget_bucket';
        else
          perform 1 from public.budget_allocations ba
          where ba.budget_period_id = v_period_id
            and ba.budget_bucket_id = v_resolved_bucket_id
          for share;
          if not found then
            raise exception using
              errcode = 'P0001',
              message = case
                when p_budget_bucket_id is not null then 'budget_bucket_not_allocated_to_period'
                else 'category_default_bucket_not_allocated_to_period'
              end;
          end if;
        end if;
      end if;
    end if;
  end if;

  v_line_amount := case v_account_class
    when 'asset' then -p_amount
    when 'liability' then p_amount
  end;

  update public.journal_entries
  set occurred_at = p_occurred_at,
      description = btrim(p_description),
      raw_text = nullif(btrim(p_raw_text), ''),
      exclude_from_budget = v_excluded
  where id = p_entry_id;

  update public.journal_lines
  set account_id = p_account_id,
      amount = v_line_amount,
      category_id = p_category_id,
      budget_bucket_id = case when v_closed_impact then v_saved_bucket_id else v_resolved_bucket_id end,
      memo = nullif(btrim(p_memo), '')
  where id = v_line_id;

  if not v_closed_impact then
    if v_old_impact_id is not null then
      delete from public.budget_impacts where id = v_old_impact_id;
    end if;
    if not v_excluded and v_warning_code is null then
      insert into public.budget_impacts (
        entry_id, line_id, budget_period_id, budget_bucket_id, amount, source
      ) values (
        p_entry_id, v_line_id, v_period_id, v_resolved_bucket_id, p_amount, 'manual'
      );
      v_budget_impact_created := true;
    end if;
  end if;

  return query select
    p_entry_id, v_line_id, v_budget_impact_created, v_period_id,
    v_resolved_bucket_id, v_excluded, v_warning_code;
end;
$function$;

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


revoke all on function public.create_expense_transaction(timestamptz,text,uuid,numeric,uuid,uuid,text,text,boolean) from public, anon;
grant execute on function public.create_expense_transaction(timestamptz,text,uuid,numeric,uuid,uuid,text,text,boolean) to authenticated;
revoke all on function public.update_expense_transaction(uuid,timestamptz,text,uuid,numeric,uuid,uuid,boolean,text,text) from public, anon;
grant execute on function public.update_expense_transaction(uuid,timestamptz,text,uuid,numeric,uuid,uuid,boolean,text,text) to authenticated;
revoke all on function public.save_monthly_budget(date,numeric,jsonb,uuid,timestamptz) from public, anon;
grant execute on function public.save_monthly_budget(date,numeric,jsonb,uuid,timestamptz) to authenticated;

notify pgrst, 'reload schema';
commit;
