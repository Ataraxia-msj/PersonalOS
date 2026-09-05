begin;

drop function if exists public.create_expense_transaction(
  timestamptz,
  text,
  uuid,
  numeric,
  uuid,
  uuid,
  text,
  text
);

create function public.create_expense_transaction(
  p_occurred_at timestamptz,
  p_description text,
  p_account_id uuid,
  p_amount numeric,
  p_category_id uuid,
  p_budget_bucket_id uuid default null,
  p_raw_text text default null,
  p_memo text default null
)
returns table (
  entry_id uuid,
  line_id uuid,
  budget_impact_created boolean,
  budget_period_id uuid,
  budget_bucket_id uuid,
  warning_code text
)
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  v_account_class text;
  v_default_bucket_id uuid;
  v_resolved_bucket_id uuid;
  v_occurred_date date;
  v_period_ids uuid[];
  v_period_count integer;
  v_period_id uuid;
  v_period_status text;
  v_entry_id uuid;
  v_line_id uuid;
  v_line_amount numeric;
  v_budget_impact_created boolean := false;
  v_warning_code text := null;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  if p_occurred_at is null then
    raise exception using
      errcode = '22023',
      message = 'occurred_at_required';
  end if;

  if p_description is null or btrim(p_description) = '' then
    raise exception using
      errcode = '22023',
      message = 'description_required';
  end if;

  if p_account_id is null then
    raise exception using
      errcode = '22023',
      message = 'account_id_required';
  end if;

  if p_category_id is null then
    raise exception using
      errcode = '22023',
      message = 'category_id_required';
  end if;

  if p_amount is null
     or p_amount = 'NaN'::numeric
     or p_amount <= 0 then
    raise exception using
      errcode = '22023',
      message = 'amount_must_be_positive';
  end if;

  if p_amount <> round(p_amount, 2) then
    raise exception using
      errcode = '22023',
      message = 'amount_must_have_at_most_two_decimal_places';
  end if;

  if p_amount > 999999999999.99 then
    raise exception using
      errcode = '22003',
      message = 'amount_out_of_range';
  end if;

  select a.account_class
    into v_account_class
  from public.accounts as a
  where a.id = p_account_id
    and a.is_active = true
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'account_not_found_or_inactive';
  end if;

  if v_account_class not in ('asset', 'liability') then
    raise exception using
      errcode = 'P0001',
      message = 'unsupported_account_class';
  end if;

  select c.default_budget_bucket_id
    into v_default_bucket_id
  from public.categories as c
  where c.id = p_category_id
    and c.is_active = true
    and c.category_type = 'expense'
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'expense_category_not_found_or_inactive';
  end if;

  v_resolved_bucket_id := coalesce(p_budget_bucket_id, v_default_bucket_id);

  -- Validate the resolved bucket before period lookup so an invalid explicit
  -- bucket cannot be hidden by a no_budget_period warning.
  if v_resolved_bucket_id is not null then
    perform 1
    from public.budget_buckets as bb
    where bb.id = v_resolved_bucket_id
      and bb.is_active = true
    for share;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = case
          when p_budget_bucket_id is not null
            then 'budget_bucket_not_found_or_inactive'
          else 'category_default_budget_bucket_not_found_or_inactive'
        end;
    end if;
  end if;

  v_occurred_date := (p_occurred_at at time zone 'Asia/Shanghai')::date;

  -- The existing unique(start_date, end_date) constraint does not prevent
  -- partially overlapping ranges, so every matching period is collected.
  select array_agg(bp.id order by bp.start_date, bp.end_date, bp.id)
    into v_period_ids
  from public.budget_periods as bp
  where v_occurred_date between bp.start_date and bp.end_date;

  v_period_count := coalesce(cardinality(v_period_ids), 0);

  if v_period_count > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'overlapping_budget_periods';
  end if;

  if v_period_count = 0 then
    v_warning_code := 'no_budget_period';
  else
    v_period_id := v_period_ids[1];

    select bp.status
      into v_period_status
    from public.budget_periods as bp
    where bp.id = v_period_id
    for share;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'budget_period_changed_during_transaction';
    end if;

    if v_period_status = 'closed' then
      v_warning_code := 'budget_period_closed';
    elsif v_resolved_bucket_id is null then
      v_warning_code := 'no_budget_bucket';
    else
      perform 1
      from public.budget_allocations as ba
      where ba.budget_period_id = v_period_id
        and ba.budget_bucket_id = v_resolved_bucket_id
      for share;

      if not found then
        raise exception using
          errcode = 'P0001',
          message = case
            when p_budget_bucket_id is not null
              then 'budget_bucket_not_allocated_to_period'
            else 'category_default_bucket_not_allocated_to_period'
          end;
      end if;
    end if;
  end if;

  v_line_amount := case v_account_class
    when 'asset' then -p_amount
    when 'liability' then p_amount
  end;

  insert into public.journal_entries (
    occurred_at,
    entry_type,
    description,
    source,
    raw_text,
    status
  )
  values (
    p_occurred_at,
    'expense',
    btrim(p_description),
    'manual',
    nullif(btrim(p_raw_text), ''),
    'confirmed'
  )
  returning id into v_entry_id;

  insert into public.journal_lines (
    entry_id,
    account_id,
    amount,
    category_id,
    memo,
    sort_order
  )
  values (
    v_entry_id,
    p_account_id,
    v_line_amount,
    p_category_id,
    nullif(btrim(p_memo), ''),
    0
  )
  returning id into v_line_id;

  if v_warning_code is null then
    insert into public.budget_impacts (
      entry_id,
      line_id,
      budget_period_id,
      budget_bucket_id,
      amount,
      source
    )
    values (
      v_entry_id,
      v_line_id,
      v_period_id,
      v_resolved_bucket_id,
      p_amount,
      'manual'
    );

    v_budget_impact_created := true;
  end if;

  return query
  select
    v_entry_id,
    v_line_id,
    v_budget_impact_created,
    v_period_id,
    v_resolved_bucket_id,
    v_warning_code;
end;
$function$;

comment on function public.create_expense_transaction(
  timestamptz,
  text,
  uuid,
  numeric,
  uuid,
  uuid,
  text,
  text
) is
'Atomically creates one confirmed manual expense, its journal line, and an optional budget impact. Business dates use Asia/Shanghai.';

revoke all
on function public.create_expense_transaction(
  timestamptz,
  text,
  uuid,
  numeric,
  uuid,
  uuid,
  text,
  text
)
from public, anon;

grant execute
on function public.create_expense_transaction(
  timestamptz,
  text,
  uuid,
  numeric,
  uuid,
  uuid,
  text,
  text
)
to authenticated;

commit;
