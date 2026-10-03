-- REVIEW BEFORE EXECUTION. Requires transfer and income transaction migrations.
-- Adds atomic editing for current-format manual confirmed income and transfers.
begin;
set local lock_timeout = '5s';

create function public.update_income_transaction(
  p_entry_id uuid,
  p_occurred_at timestamptz,
  p_description text,
  p_account_id uuid,
  p_amount numeric,
  p_category_id uuid,
  p_raw_text text default null,
  p_memo text default null
)
returns table (entry_id uuid, line_id uuid)
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '5s'
as $income$
declare
  v_description text := nullif(btrim(p_description), '');
  v_raw_text text := nullif(btrim(p_raw_text), '');
  v_memo text := nullif(btrim(p_memo), '');
  v_entry public.journal_entries%rowtype;
  v_line public.journal_lines%rowtype;
  v_account public.accounts%rowtype;
  v_category public.categories%rowtype;
  v_line_ids uuid[];
  v_impact_count integer;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_entry_id is null or p_account_id is null or p_category_id is null then
    raise exception 'invalid_income_id' using errcode = '22023';
  end if;
  if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity')
    or p_amount <= 0 or p_amount > 999999999999.99
    or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_income_amount' using errcode = '22023';
  end if;
  if p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at > now() then
    raise exception 'invalid_income_time' using errcode = '22023';
  end if;
  if v_description is null or length(v_description) > 1000
    or length(v_memo) > 1000 or length(v_raw_text) > 10000 then
    raise exception 'invalid_income_description_or_memo' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(1782, 1);

  select e.* into v_entry
  from public.journal_entries e
  where e.id = p_entry_id
  for update;
  if not found then
    raise exception 'income_entry_not_found' using errcode = 'P0001';
  end if;
  if v_entry.entry_type <> 'income' or v_entry.status <> 'confirmed'
    or v_entry.source <> 'manual' or v_entry.related_entry_id is not null
    or v_entry.exclude_from_budget or v_entry.transfer_purpose is not null then
    raise exception 'income_entry_not_editable' using errcode = 'P0001';
  end if;

  select array_agg(locked.id order by locked.sort_order, locked.id)
    into v_line_ids
  from (
    select l.id, l.sort_order from public.journal_lines l
    where l.entry_id = p_entry_id for update
  ) locked;
  if coalesce(cardinality(v_line_ids), 0) <> 1 then
    raise exception 'income_entry_must_have_exactly_one_line' using errcode = 'P0001';
  end if;
  select l.* into v_line from public.journal_lines l where l.id = v_line_ids[1];
  select count(*) into v_impact_count from public.budget_impacts bi where bi.entry_id = p_entry_id;
  if v_line.sort_order <> 0 or v_line.amount <= 0 or v_line.category_id is null
    or v_line.budget_bucket_id is not null or v_impact_count <> 0 then
    raise exception 'income_entry_structure_invalid' using errcode = 'P0001';
  end if;

  select a.* into v_account from public.accounts a where a.id = p_account_id for share;
  if not found then raise exception 'account_not_found' using errcode = '22023'; end if;
  if not v_account.is_active then raise exception 'account_inactive' using errcode = '22023'; end if;
  if v_account.account_class <> 'asset' then
    raise exception 'income_account_must_be_asset' using errcode = '22023';
  end if;

  select c.* into v_category from public.categories c where c.id = p_category_id for share;
  if not found or not v_category.is_active or v_category.category_type <> 'income' then
    raise exception 'income_category_not_found_or_inactive' using errcode = '22023';
  end if;

  update public.journal_entries e
  set occurred_at = p_occurred_at,
      description = v_description,
      raw_text = coalesce(v_raw_text, e.raw_text)
  where e.id = p_entry_id;

  update public.journal_lines l
  set account_id = p_account_id,
      amount = p_amount,
      category_id = p_category_id,
      memo = v_memo
  where l.id = v_line.id;

  return query select p_entry_id, v_line.id;
end;
$income$;

revoke all on function public.update_income_transaction(
  uuid, timestamptz, text, uuid, numeric, uuid, text, text
) from public, anon;
grant execute on function public.update_income_transaction(
  uuid, timestamptz, text, uuid, numeric, uuid, text, text
) to authenticated;

create function public.update_transfer_transaction(
  p_entry_id uuid,
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
  warning_code text
)
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '5s'
as $transfer$
declare
  v_description text := nullif(btrim(p_description), '');
  v_memo text := nullif(btrim(p_memo), '');
  v_entry public.journal_entries%rowtype;
  v_from_line public.journal_lines%rowtype;
  v_to_line public.journal_lines%rowtype;
  v_old_from public.accounts%rowtype;
  v_old_to public.accounts%rowtype;
  v_from public.accounts%rowtype;
  v_to public.accounts%rowtype;
  v_bucket public.budget_buckets%rowtype;
  v_existing_bucket public.budget_buckets%rowtype;
  v_period public.budget_periods%rowtype;
  v_impact public.budget_impacts%rowtype;
  v_line_ids uuid[];
  v_impact_ids uuid[];
  v_old_period_status text;
  v_closed_impact boolean := false;
  v_date date;
  v_period_count integer;
  v_warning text;
  v_apply_budget boolean := false;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_entry_id is null or p_from_account_id is null or p_to_account_id is null then
    raise exception 'invalid_transfer_id' using errcode = '22023';
  end if;
  if p_from_account_id = p_to_account_id then
    raise exception 'invalid_transfer_same_account' using errcode = '22023';
  end if;
  if p_purpose is null or p_purpose not in ('general', 'saving', 'investment', 'debt') then
    raise exception 'invalid_transfer_purpose' using errcode = '22023';
  end if;
  if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity')
    or p_amount <= 0 or p_amount > 999999999999.99
    or p_amount <> round(p_amount, 2) then
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

  perform pg_advisory_xact_lock(1782, 1);

  select e.* into v_entry from public.journal_entries e where e.id = p_entry_id for update;
  if not found then raise exception 'transfer_entry_not_found' using errcode = 'P0001'; end if;
  if v_entry.entry_type <> 'transfer' or v_entry.status <> 'confirmed'
    or v_entry.source <> 'manual' or v_entry.related_entry_id is not null
    or v_entry.transfer_purpose not in ('general', 'saving', 'investment', 'debt') then
    raise exception 'transfer_entry_not_editable' using errcode = 'P0001';
  end if;

  select array_agg(locked.id order by locked.sort_order, locked.id)
    into v_line_ids
  from (
    select l.id, l.sort_order from public.journal_lines l
    where l.entry_id = p_entry_id for update
  ) locked;
  if coalesce(cardinality(v_line_ids), 0) <> 2 then
    raise exception 'transfer_entry_must_have_exactly_two_lines' using errcode = 'P0001';
  end if;
  select l.* into v_from_line from public.journal_lines l where l.id = v_line_ids[1];
  select l.* into v_to_line from public.journal_lines l where l.id = v_line_ids[2];
  if v_from_line.sort_order <> 0 or v_to_line.sort_order <> 1
    or v_from_line.category_id is not null or v_to_line.category_id is not null
    or v_to_line.budget_bucket_id is not null then
    raise exception 'transfer_entry_structure_invalid' using errcode = 'P0001';
  end if;
  if v_from_line.budget_bucket_id is not null then
    select bb.* into v_existing_bucket from public.budget_buckets bb
    where bb.id = v_from_line.budget_bucket_id for share;
    if not found or not v_existing_bucket.is_active
      or v_existing_bucket.bucket_kind <> v_entry.transfer_purpose then
      raise exception 'transfer_entry_structure_invalid' using errcode = 'P0001';
    end if;
  end if;
  select a.* into v_old_from from public.accounts a where a.id = v_from_line.account_id;
  select a.* into v_old_to from public.accounts a where a.id = v_to_line.account_id;
  if v_old_from.id is null or v_old_to.id is null or v_old_from.account_class <> 'asset'
    or v_old_from.id = v_old_to.id or v_old_from.currency <> v_old_to.currency
    or v_old_to.account_class <> (case when v_entry.transfer_purpose = 'debt' then 'liability' else 'asset' end)
    or v_from_line.amount >= 0
    or v_to_line.amount <> (case when v_entry.transfer_purpose = 'debt'
      then v_from_line.amount else -v_from_line.amount end)
    or (v_entry.transfer_purpose = 'general' and
      (not v_entry.exclude_from_budget or v_from_line.budget_bucket_id is not null))
    or (v_entry.transfer_purpose <> 'general' and v_entry.exclude_from_budget) then
    raise exception 'transfer_entry_structure_invalid' using errcode = 'P0001';
  end if;

  select array_agg(locked.id order by locked.id) into v_impact_ids
  from (
    select bi.id from public.budget_impacts bi
    where bi.entry_id = p_entry_id for update
  ) locked;
  if coalesce(cardinality(v_impact_ids), 0) > 1 then
    raise exception 'transfer_entry_has_multiple_budget_impacts' using errcode = 'P0001';
  end if;
  if cardinality(v_impact_ids) = 1 then
    select bi.* into v_impact from public.budget_impacts bi where bi.id = v_impact_ids[1];
    if v_impact.line_id is distinct from v_from_line.id then
      raise exception 'transfer_budget_integrity_error' using errcode = '23514';
    end if;
    select bp.status into v_old_period_status
    from public.budget_periods bp where bp.id = v_impact.budget_period_id for share;
    if not found then raise exception 'transfer_budget_integrity_error' using errcode = '23514'; end if;
    v_closed_impact := v_old_period_status = 'closed';
    -- A closed impact is immutable historical budget truth. Later transaction edits
    -- may intentionally diverge in amount or classification without rewriting it.
    if not v_closed_impact and (
      v_impact.budget_bucket_id is distinct from v_from_line.budget_bucket_id
      or v_impact.amount is distinct from -v_from_line.amount
    ) then
      raise exception 'transfer_budget_integrity_error' using errcode = '23514';
    end if;
  end if;

  perform 1 from public.accounts a
  where a.id in (p_from_account_id, p_to_account_id) order by a.id for share;
  select a.* into v_from from public.accounts a where a.id = p_from_account_id;
  select a.* into v_to from public.accounts a where a.id = p_to_account_id;
  if v_from.id is null or v_to.id is null then
    raise exception 'account_not_found' using errcode = '22023';
  end if;
  if not v_from.is_active or not v_to.is_active then
    raise exception 'account_inactive' using errcode = '22023';
  end if;
  if v_from.account_class <> 'asset'
    or v_to.account_class <> (case when p_purpose = 'debt' then 'liability' else 'asset' end) then
    raise exception 'invalid_transfer_account_classes' using errcode = '22023';
  end if;
  if v_from.currency <> v_to.currency then
    raise exception 'currency_mismatch' using errcode = '22023';
  end if;

  if p_budget_bucket_id is not null then
    select bb.* into v_bucket from public.budget_buckets bb
    where bb.id = p_budget_bucket_id for share;
    if not found or not v_bucket.is_active then
      raise exception 'budget_bucket_not_found_or_inactive' using errcode = '22023';
    end if;
    if v_bucket.bucket_kind <> p_purpose then
      raise exception 'budget_bucket_kind_mismatch' using errcode = '22023';
    end if;
  end if;

  if v_closed_impact then
    v_warning := 'budget_period_closed_preserved';
  else
    v_date := (p_occurred_at at time zone 'Asia/Shanghai')::date;
    perform 1 from public.budget_periods bp
      where v_date between bp.start_date and bp.end_date order by bp.id for share;
    select count(*) into v_period_count from public.budget_periods bp
      where v_date between bp.start_date and bp.end_date;
    if v_period_count > 1 then
      raise exception 'overlapping_budget_periods' using errcode = '23514';
    end if;
    select bp.* into v_period from public.budget_periods bp
      where v_date between bp.start_date and bp.end_date;
    if p_purpose <> 'general' then
      if p_budget_bucket_id is null then v_warning := 'no_budget_bucket';
      elsif v_period_count = 0 then v_warning := 'no_budget_period';
      elsif v_period.status = 'closed' then v_warning := 'budget_period_closed';
      elsif v_period.currency <> v_from.currency then v_warning := 'budget_currency_mismatch';
      else
        perform 1 from public.budget_allocations ba
        where ba.budget_period_id = v_period.id
          and ba.budget_bucket_id = p_budget_bucket_id for share;
        if not found then v_warning := 'no_budget_allocation';
        else v_apply_budget := true;
        end if;
      end if;
    end if;
  end if;

  update public.journal_entries e
  set occurred_at = p_occurred_at,
      description = v_description,
      exclude_from_budget = p_purpose = 'general',
      transfer_purpose = p_purpose
  where e.id = p_entry_id;
  update public.journal_lines l
  set account_id = p_from_account_id,
      amount = -p_amount,
      memo = v_memo,
      budget_bucket_id = p_budget_bucket_id
  where l.id = v_from_line.id;
  update public.journal_lines l
  set account_id = p_to_account_id,
      amount = case when p_purpose = 'debt' then -p_amount else p_amount end,
      memo = v_memo,
      budget_bucket_id = null
  where l.id = v_to_line.id;

  if not v_closed_impact then
    if v_impact.id is not null then
      delete from public.budget_impacts bi where bi.id = v_impact.id;
    end if;
    if v_apply_budget then
      insert into public.budget_impacts(
        entry_id, line_id, budget_period_id, budget_bucket_id, amount, source
      ) values (
        p_entry_id, v_from_line.id, v_period.id, p_budget_bucket_id, p_amount, 'manual'
      );
    end if;
  end if;

  return query select
    p_entry_id,
    v_from_line.id,
    v_to_line.id,
    case when v_closed_impact then true else v_apply_budget end,
    case when v_closed_impact then v_impact.budget_period_id
      when v_apply_budget then v_period.id else null::uuid end,
    case when v_closed_impact then v_impact.budget_bucket_id
      else p_budget_bucket_id end,
    v_warning;
end;
$transfer$;

revoke all on function public.update_transfer_transaction(
  uuid, timestamptz, text, uuid, uuid, numeric, text, uuid, text
) from public, anon;
grant execute on function public.update_transfer_transaction(
  uuid, timestamptz, text, uuid, uuid, numeric, text, uuid, text
) to authenticated;

notify pgrst, 'reload schema';
commit;
