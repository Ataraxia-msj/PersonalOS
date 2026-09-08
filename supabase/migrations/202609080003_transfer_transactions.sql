-- REVIEW BEFORE EXECUTION. Requires 202609080001 budget attribution migration.
-- Adds transfer purpose + RPC; extends monthly backfill and transaction View.
-- No historical reclassification, no table grants/RLS changes, no expense RPC changes.
begin;
set local lock_timeout = '5s';

alter table public.journal_entries add column transfer_purpose text;
alter table public.journal_entries add constraint journal_entries_transfer_purpose_check
  check (transfer_purpose is null or
    (entry_type = 'transfer' and transfer_purpose in ('general','saving','investment','debt')));
comment on column public.journal_entries.transfer_purpose is
  'Explicit transfer intent. general never affects budget; saving/investment/debt count cumulative contributions. Legacy rows remain NULL.';

create function public.create_transfer_transaction(
  p_request_id uuid,
  p_occurred_at timestamptz,
  p_description text,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_purpose text,
  p_budget_bucket_id uuid default null,
  p_memo text default null
)
returns table (
  entry_id uuid,
  from_line_id uuid,
  to_line_id uuid,
  budget_impact_created boolean,
  budget_period_id uuid,
  budget_bucket_id uuid,
  warning_code text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
as $transfer$
declare
  v_description text := nullif(btrim(p_description), '');
  v_memo text := nullif(btrim(p_memo), '');
  v_from public.accounts%rowtype;
  v_to public.accounts%rowtype;
  v_existing public.journal_entries%rowtype;
  v_from_line public.journal_lines%rowtype;
  v_to_line public.journal_lines%rowtype;
  v_bucket public.budget_buckets%rowtype;
  v_period public.budget_periods%rowtype;
  v_impact public.budget_impacts%rowtype;
  v_date date;
  v_period_count integer;
  v_line_count integer;
  v_impact_count integer;
  v_warning text;
  v_apply_budget boolean := false;
  v_from_id uuid;
  v_to_id uuid;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_request_id is null or p_from_account_id is null or p_to_account_id is null then
    raise exception 'invalid_transfer_id' using errcode = '22023';
  end if;
  if p_from_account_id = p_to_account_id then
    raise exception 'invalid_transfer_same_account' using errcode = '22023';
  end if;
  if p_purpose is null or p_purpose not in ('general','saving','investment','debt') then
    raise exception 'invalid_transfer_purpose' using errcode = '22023';
  end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount <= 0 or p_amount > 999999999999.99 or p_amount <> round(p_amount,2) then
    raise exception 'invalid_transfer_amount' using errcode = '22023';
  end if;
  if p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at > now() then
    raise exception 'invalid_transfer_time' using errcode = '22023';
  end if;
  if v_description is null or length(v_description) > 1000 or length(v_memo) > 1000 then
    raise exception 'invalid_transfer_description_or_memo' using errcode = '22023';
  end if;
  if p_purpose = 'general' and p_budget_bucket_id is not null then
    raise exception 'general_transfer_cannot_have_budget_bucket' using errcode = '22023';
  end if;

  -- Same lock as expense, monthly save and reconciliation RPCs; no external calls.
  perform pg_advisory_xact_lock(1782,1);

  -- Replay before mutable account/bucket configuration checks. A successfully
  -- committed request must remain replayable even if that configuration changes.
  select e.* into v_existing from public.journal_entries e where e.id=p_request_id for update;
  if found then
    select count(*) into v_line_count from public.journal_lines l where l.entry_id=p_request_id;
    select l.* into v_from_line from public.journal_lines l where l.entry_id=p_request_id and l.sort_order=0;
    select l.* into v_to_line from public.journal_lines l where l.entry_id=p_request_id and l.sort_order=1;
    if v_line_count <> 2 or v_from_line.id is null or v_to_line.id is null
      or v_existing.entry_type <> 'transfer' or v_existing.status <> 'confirmed' or v_existing.source <> 'manual'
      or v_existing.transfer_purpose is distinct from p_purpose
      or v_existing.occurred_at is distinct from p_occurred_at
      or v_existing.description is distinct from v_description
      or v_existing.exclude_from_budget is distinct from (p_purpose='general')
      or v_existing.related_entry_id is not null
      or v_from_line.account_id is distinct from p_from_account_id
      or v_to_line.account_id is distinct from p_to_account_id
      or v_from_line.amount is distinct from -p_amount
      or v_to_line.amount is distinct from (case when p_purpose='debt' then -p_amount else p_amount end)
      or v_from_line.budget_bucket_id is distinct from p_budget_bucket_id
      or v_to_line.budget_bucket_id is not null
      or v_from_line.category_id is not null or v_to_line.category_id is not null
      or v_from_line.memo is distinct from v_memo or v_to_line.memo is distinct from v_memo then
      raise exception 'request_payload_conflict' using errcode = '22023';
    end if;
    select count(*) into v_impact_count from public.budget_impacts bi where bi.entry_id=p_request_id;
    if v_impact_count > 1 then
      raise exception 'transfer_budget_integrity_error' using errcode = '23514';
    end if;
    select bi.* into v_impact from public.budget_impacts bi where bi.entry_id=p_request_id;
    if v_impact_count=1 and (p_purpose='general' or v_impact.line_id is distinct from v_from_line.id
      or v_impact.budget_bucket_id is distinct from p_budget_bucket_id or v_impact.amount is distinct from p_amount) then
      raise exception 'transfer_budget_integrity_error' using errcode = '23514';
    end if;
    -- Report current saved state (a later monthly save may have created impact).
    v_warning := case when p_purpose='general' or v_impact_count=1 then null
      when p_budget_bucket_id is null then 'no_budget_bucket' else 'budget_not_applied' end;
    return query select p_request_id,v_from_line.id,v_to_line.id,v_impact_count=1,
      v_impact.budget_period_id,p_budget_bucket_id,v_warning,true;
    return;
  end if;

  -- Deterministic row-lock order; no currency conversion or balance sufficiency
  -- gate based on estimates. Existing actual snapshots remain authoritative.
  perform 1 from public.accounts a where a.id in (p_from_account_id,p_to_account_id) order by a.id for share;
  select a.* into v_from from public.accounts a where a.id=p_from_account_id;
  select a.* into v_to from public.accounts a where a.id=p_to_account_id;
  if v_from.id is null or v_to.id is null then
    raise exception 'account_not_found' using errcode = '22023';
  end if;
  if not v_from.is_active or not v_to.is_active then
    raise exception 'account_inactive' using errcode = '22023';
  end if;
  if v_from.account_class <> 'asset'
    or v_to.account_class <> (case when p_purpose='debt' then 'liability' else 'asset' end) then
    raise exception 'invalid_transfer_account_classes' using errcode = '22023';
  end if;
  if v_from.currency <> v_to.currency then
    raise exception 'currency_mismatch' using errcode = '22023';
  end if;

  -- Validate explicit classification BEFORE missing/closed period warnings.
  if p_budget_bucket_id is not null then
    select bb.* into v_bucket from public.budget_buckets bb where bb.id=p_budget_bucket_id for share;
    if not found or not v_bucket.is_active then
      raise exception 'budget_bucket_not_found_or_inactive' using errcode = '22023';
    end if;
    if v_bucket.bucket_kind <> p_purpose then
      raise exception 'budget_bucket_kind_mismatch' using errcode = '22023';
    end if;
  end if;
  v_date := (p_occurred_at at time zone 'Asia/Shanghai')::date;
  perform 1 from public.budget_periods bp where v_date between bp.start_date and bp.end_date order by bp.id for share;
  select count(*) into v_period_count from public.budget_periods bp where v_date between bp.start_date and bp.end_date;
  if v_period_count > 1 then
    raise exception 'overlapping_budget_periods' using errcode = '23514';
  end if;
  select bp.* into v_period from public.budget_periods bp where v_date between bp.start_date and bp.end_date;
  if p_purpose <> 'general' then
    if p_budget_bucket_id is null then v_warning := 'no_budget_bucket';
    elsif v_period_count=0 then v_warning := 'no_budget_period';
    elsif v_period.status='closed' then v_warning := 'budget_period_closed';
    elsif v_period.currency <> v_from.currency then v_warning := 'budget_currency_mismatch';
    else
      perform 1 from public.budget_allocations ba where ba.budget_period_id=v_period.id
        and ba.budget_bucket_id=p_budget_bucket_id for share;
      if not found then v_warning := 'no_budget_allocation';
      else v_apply_budget := true; end if;
    end if;
  end if;

  insert into public.journal_entries(id,occurred_at,entry_type,description,source,status,exclude_from_budget,transfer_purpose)
    values(p_request_id,p_occurred_at,'transfer',v_description,'manual','confirmed',p_purpose='general',p_purpose);
  insert into public.journal_lines(entry_id,account_id,amount,category_id,memo,sort_order,budget_bucket_id)
    values(p_request_id,p_from_account_id,-p_amount,null,v_memo,0,p_budget_bucket_id) returning id into v_from_id;
  insert into public.journal_lines(entry_id,account_id,amount,category_id,memo,sort_order,budget_bucket_id)
    values(p_request_id,p_to_account_id,case when p_purpose='debt' then -p_amount else p_amount end,null,v_memo,1,null)
    returning id into v_to_id;
  if v_apply_budget then
    insert into public.budget_impacts(entry_id,line_id,budget_period_id,budget_bucket_id,amount,source)
      values(p_request_id,v_from_id,v_period.id,p_budget_bucket_id,p_amount,'manual');
  end if;
  return query select p_request_id,v_from_id,v_to_id,v_apply_budget,
    case when v_apply_budget then v_period.id else null::uuid end,p_budget_bucket_id,v_warning,false;
end;
$transfer$;

revoke all on function public.create_transfer_transaction(uuid,timestamptz,text,uuid,uuid,numeric,text,uuid,text) from public,anon;
grant execute on function public.create_transfer_transaction(uuid,timestamptz,text,uuid,uuid,numeric,text,uuid,text) to authenticated;


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
  v_transfer_backfilled integer := 0;
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

  -- Transfers persist attribution ONLY on the outgoing row. Never sum or
  -- independently attribute both lines; returns recorded as general are excluded.
  insert into public.budget_impacts (
    entry_id,line_id,budget_period_id,budget_bucket_id,amount,source,note
  )
  select je.id,out_line.id,v_period.id,out_line.budget_bucket_id,-out_line.amount,'auto',
    'monthly_budget_save: persisted transfer contribution'
  from public.journal_entries je
  join public.journal_lines out_line on out_line.entry_id=je.id and out_line.sort_order=0
  join public.journal_lines in_line on in_line.entry_id=je.id and in_line.sort_order=1
  join public.accounts src on src.id=out_line.account_id
  join public.accounts dst on dst.id=in_line.account_id
  join public.budget_buckets bb on bb.id=out_line.budget_bucket_id and bb.bucket_kind=je.transfer_purpose
  join public.budget_allocations ba on ba.budget_period_id=v_period.id and ba.budget_bucket_id=bb.id
  where je.entry_type='transfer' and je.transfer_purpose in ('saving','investment','debt')
    and je.status='confirmed' and je.source='manual' and je.related_entry_id is null
    and not je.exclude_from_budget
    and je.occurred_at >= (p_month::timestamp at time zone 'Asia/Shanghai')
    and je.occurred_at < ((p_month + interval '1 month') at time zone 'Asia/Shanghai')
    and je.occurred_at <= now()
    and src.id <> dst.id and src.account_class='asset'
    and dst.account_class=case when je.transfer_purpose='debt' then 'liability' else 'asset' end
    and src.currency=v_period.currency and dst.currency=v_period.currency
    and out_line.category_id is null and in_line.category_id is null
    and in_line.budget_bucket_id is null
    and out_line.amount::text not in ('NaN','Infinity','-Infinity')
    and out_line.amount < 0
    and in_line.amount=case when je.transfer_purpose='debt' then out_line.amount else -out_line.amount end
    and (select count(*) from public.journal_lines other where other.entry_id=je.id)=2
    and not exists(select 1 from public.budget_impacts bi where bi.entry_id=je.id);
  get diagnostics v_transfer_backfilled = row_count;
  v_backfilled := v_backfilled + v_transfer_backfilled;


  select count(*)::integer into v_pending
  from public.journal_entries je
  where (je.entry_type = 'expense' or (je.entry_type = 'transfer'
      and je.transfer_purpose in ('saving','investment','debt'))) and je.status = 'confirmed'
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
  saved_bb.name as saved_budget_bucket_name,
  e.transfer_purpose
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

-- CREATE OR REPLACE retains existing function/View grants. Only the new RPC
-- receives explicit EXECUTE grants above. PostgREST schema reload after commit.
notify pgrst, 'reload schema';
commit;
