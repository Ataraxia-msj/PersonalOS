begin;

alter table public.journal_entries
  add column if not exists exclude_from_budget boolean not null default false;

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
  e.exclude_from_budget
from public.journal_entries e
join public.journal_lines l on l.entry_id = e.id
join public.accounts a on a.id = l.account_id
left join public.categories c on c.id = l.category_id;

create or replace view public.vw_monthly_financial_summary
with (security_invoker = true) as
with periods as (
  select
    bp.id,
    bp.start_date,
    bp.end_date,
    bp.planned_income,
    bp.currency,
    bp.status,
    bp.note,
    bp.created_at,
    bp.updated_at,
    bp.start_date::timestamp without time zone at time zone 'Asia/Shanghai' as period_start_at,
    (bp.end_date + 1)::timestamp without time zone at time zone 'Asia/Shanghai' as period_end_exclusive,
    least(
      now(),
      (bp.end_date + 1)::timestamp without time zone at time zone 'Asia/Shanghai'
    ) as summary_as_of
  from public.budget_periods bp
), planned as (
  select
    ba.budget_period_id,
    coalesce(sum(ba.planned_amount), 0::numeric) as planned_total_allocated,
    coalesce(sum(ba.planned_amount) filter (where bb.bucket_kind = 'expense'), 0::numeric) as planned_expense,
    coalesce(sum(ba.planned_amount) filter (where bb.bucket_kind = 'saving'), 0::numeric) as planned_saving,
    coalesce(sum(ba.planned_amount) filter (where bb.bucket_kind = 'investment'), 0::numeric) as planned_investment,
    coalesce(sum(ba.planned_amount) filter (where bb.bucket_kind = 'debt'), 0::numeric) as planned_debt
  from public.budget_allocations ba
  join public.budget_buckets bb on bb.id = ba.budget_bucket_id
  group by ba.budget_period_id
), actual_budget as (
  select
    bi.budget_period_id,
    coalesce(sum(bi.amount) filter (where bb.bucket_kind = 'expense'), 0::numeric) as actual_expense,
    coalesce(sum(bi.amount) filter (where bb.bucket_kind = 'saving'), 0::numeric) as actual_saving,
    coalesce(sum(bi.amount) filter (where bb.bucket_kind = 'investment'), 0::numeric) as actual_investment,
    coalesce(sum(bi.amount) filter (where bb.bucket_kind = 'debt'), 0::numeric) as actual_debt
  from public.budget_impacts bi
  join public.budget_buckets bb on bb.id = bi.budget_bucket_id
  join public.journal_entries je on je.id = bi.entry_id
  join periods p on p.id = bi.budget_period_id
  where je.status = 'confirmed'
    and je.occurred_at >= p.period_start_at
    and je.occurred_at < p.period_end_exclusive
    and je.occurred_at <= now()
  group by bi.budget_period_id
), actual_total_expense as (
  select
    p.id as budget_period_id,
    coalesce(sum(abs(jl.amount)), 0::numeric) as actual_total_expense
  from periods p
  join public.journal_entries je
    on je.entry_type = 'expense'
   and je.status = 'confirmed'
   and je.occurred_at >= p.period_start_at
   and je.occurred_at < p.period_end_exclusive
   and je.occurred_at <= now()
  join public.journal_lines jl on jl.entry_id = je.id
  group by p.id
), actual_income as (
  select
    p.id as budget_period_id,
    coalesce(sum(jl.amount), 0::numeric) as actual_income
  from periods p
  join public.journal_entries je
    on je.status = 'confirmed'
   and je.occurred_at >= p.period_start_at
   and je.occurred_at < p.period_end_exclusive
   and je.occurred_at <= now()
  join public.journal_lines jl on jl.entry_id = je.id
  join public.categories c on c.id = jl.category_id and c.category_type = 'income'
  group by p.id
), net_worth as (
  select
    p.id as budget_period_id,
    case
      when count(*) filter (
        where a.include_in_net_worth = true and start_snapshot.snapshot_at is null
      ) > 0 then null::numeric
      else sum(
        case
          when a.include_in_net_worth = false then 0::numeric
          when a.account_class = 'asset' then start_snapshot.balance + coalesce(start_changes.amount, 0::numeric)
          when a.account_class = 'liability' then -(start_snapshot.balance + coalesce(start_changes.amount, 0::numeric))
          else 0::numeric
        end
      )
    end as net_worth_start,
    case
      when count(*) filter (
        where a.include_in_net_worth = true and current_snapshot.snapshot_at is null
      ) > 0 then null::numeric
      else sum(
        case
          when a.include_in_net_worth = false then 0::numeric
          when a.account_class = 'asset' then current_snapshot.balance + coalesce(current_changes.amount, 0::numeric)
          when a.account_class = 'liability' then -(current_snapshot.balance + coalesce(current_changes.amount, 0::numeric))
          else 0::numeric
        end
      )
    end as net_worth_as_of,
    count(*) filter (
      where a.include_in_net_worth = true and start_snapshot.snapshot_at is null
    ) as missing_start_snapshots,
    count(*) filter (
      where a.include_in_net_worth = true and current_snapshot.snapshot_at is null
    ) as missing_current_snapshots
  from periods p
  cross join public.accounts a
  left join lateral (
    select bs.snapshot_at, bs.balance
    from public.balance_snapshots bs
    where bs.account_id = a.id
      and bs.snapshot_at <= p.period_start_at
    order by bs.snapshot_at desc
    limit 1
  ) start_snapshot on true
  left join lateral (
    select sum(jl.amount) as amount
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    where jl.account_id = a.id
      and je.status = 'confirmed'
      and start_snapshot.snapshot_at is not null
      and je.occurred_at > start_snapshot.snapshot_at
      and je.occurred_at <= p.period_start_at
  ) start_changes on true
  left join lateral (
    select bs.snapshot_at, bs.balance
    from public.balance_snapshots bs
    where bs.account_id = a.id
      and bs.snapshot_at <= p.summary_as_of
    order by bs.snapshot_at desc
    limit 1
  ) current_snapshot on true
  left join lateral (
    select sum(jl.amount) as amount
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    where jl.account_id = a.id
      and je.status = 'confirmed'
      and current_snapshot.snapshot_at is not null
      and je.occurred_at > current_snapshot.snapshot_at
      and je.occurred_at <= p.summary_as_of
  ) current_changes on true
  group by p.id
)
select
  p.id as budget_period_id,
  p.start_date,
  p.end_date,
  p.status,
  p.currency,
  p.summary_as_of,
  p.planned_income,
  coalesce(ai.actual_income, 0::numeric) as actual_income,
  coalesce(pl.planned_total_allocated, 0::numeric) as planned_total_allocated,
  p.planned_income - coalesce(pl.planned_total_allocated, 0::numeric) as planned_unallocated,
  coalesce(pl.planned_expense, 0::numeric) as planned_expense,
  coalesce(pl.planned_saving, 0::numeric) as planned_saving,
  coalesce(pl.planned_investment, 0::numeric) as planned_investment,
  coalesce(pl.planned_debt, 0::numeric) as planned_debt,
  coalesce(ab.actual_expense, 0::numeric) as actual_expense,
  coalesce(ab.actual_saving, 0::numeric) as actual_saving,
  coalesce(ab.actual_investment, 0::numeric) as actual_investment,
  coalesce(ab.actual_debt, 0::numeric) as actual_debt,
  coalesce(ai.actual_income, 0::numeric)
    - coalesce(ab.actual_expense, 0::numeric)
    - coalesce(ab.actual_saving, 0::numeric)
    - coalesce(ab.actual_investment, 0::numeric)
    - coalesce(ab.actual_debt, 0::numeric) as actual_unallocated,
  coalesce(ab.actual_expense, 0::numeric)
    - coalesce(pl.planned_expense, 0::numeric) as expense_variance,
  case
    when coalesce(ai.actual_income, 0::numeric) > 0::numeric
      then round(coalesce(ab.actual_saving, 0::numeric) / ai.actual_income * 100::numeric, 2)
    else null::numeric
  end as saving_rate,
  nw.net_worth_start,
  nw.net_worth_as_of,
  case
    when nw.net_worth_start is not null and nw.net_worth_as_of is not null
      then nw.net_worth_as_of - nw.net_worth_start
    else null::numeric
  end as net_worth_change,
  nw.missing_start_snapshots,
  nw.missing_current_snapshots,
  coalesce(ate.actual_total_expense, 0::numeric) as actual_total_expense
from periods p
left join planned pl on pl.budget_period_id = p.id
left join actual_budget ab on ab.budget_period_id = p.id
left join actual_total_expense ate on ate.budget_period_id = p.id
left join actual_income ai on ai.budget_period_id = p.id
left join net_worth nw on nw.budget_period_id = p.id;

drop function if exists public.create_expense_transaction(
  timestamptz, text, uuid, numeric, uuid, uuid, text, text
);

drop function if exists public.create_expense_transaction(
  timestamptz, text, uuid, numeric, uuid, uuid, text, text, boolean
);

create function public.create_expense_transaction(
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
  v_excluded boolean := coalesce(p_exclude_from_budget, false);
  v_budget_impact_created boolean := false;
  v_warning_code text := null;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
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

  select a.account_class into v_account_class
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
      select bp.status into v_period_status
      from public.budget_periods bp where bp.id = v_period_id
      for share;
      if not found then
        raise exception using errcode = 'P0001', message = 'budget_period_changed_during_transaction';
      elsif v_period_status = 'closed' then
        v_warning_code := 'budget_period_closed';
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
    entry_id, account_id, amount, category_id, memo, sort_order
  ) values (
    v_entry_id, p_account_id, v_line_amount, p_category_id,
    nullif(btrim(p_memo), ''), 0
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

drop function if exists public.update_expense_transaction(
  uuid, timestamptz, text, uuid, numeric, uuid, uuid, boolean, text, text
);

create function public.update_expense_transaction(
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
as $function$
declare
  v_entry_type text;
  v_entry_status text;
  v_entry_source text;
  v_existing_excluded boolean;
  v_line_ids uuid[];
  v_line_id uuid;
  v_impact_ids uuid[];
  v_old_impact_id uuid;
  v_old_period_id uuid;
  v_old_bucket_id uuid;
  v_old_period_status text;
  v_closed_impact boolean := false;
  v_account_class text;
  v_default_bucket_id uuid;
  v_resolved_bucket_id uuid;
  v_occurred_date date;
  v_period_ids uuid[];
  v_period_count integer;
  v_period_id uuid;
  v_period_status text;
  v_line_amount numeric;
  v_excluded boolean;
  v_budget_impact_created boolean := false;
  v_warning_code text := null;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
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

  select a.account_class into v_account_class
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
        select bp.status into v_period_status
        from public.budget_periods bp where bp.id = v_period_id
        for share;
        if not found then
          raise exception using errcode = 'P0001', message = 'budget_period_changed_during_transaction';
        elsif v_period_status = 'closed' then
          v_warning_code := 'budget_period_closed';
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

comment on column public.journal_entries.exclude_from_budget is
'True when an expense is intentionally excluded from budget execution while remaining part of actual total expense.';

comment on function public.create_expense_transaction(
  timestamptz, text, uuid, numeric, uuid, uuid, text, text, boolean
) is
'Atomically creates one confirmed manual expense and an optional budget impact. Business dates use Asia/Shanghai.';

comment on function public.update_expense_transaction(
  uuid, timestamptz, text, uuid, numeric, uuid, uuid, boolean, text, text
) is
'Atomically updates one confirmed manual single-line expense and reconciles its open-period budget impact.';

revoke all on function public.create_expense_transaction(
  timestamptz, text, uuid, numeric, uuid, uuid, text, text, boolean
) from public, anon;
grant execute on function public.create_expense_transaction(
  timestamptz, text, uuid, numeric, uuid, uuid, text, text, boolean
) to authenticated;

revoke all on function public.update_expense_transaction(
  uuid, timestamptz, text, uuid, numeric, uuid, uuid, boolean, text, text
) from public, anon;
grant execute on function public.update_expense_transaction(
  uuid, timestamptz, text, uuid, numeric, uuid, uuid, boolean, text, text
) to authenticated;

commit;
