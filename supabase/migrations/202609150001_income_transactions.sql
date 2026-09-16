-- REVIEW BEFORE EXECUTION. Adds the authenticated, idempotent income RPC only.
-- No table/View/RLS/grant changes and no historical data rewrite.
begin;
set local lock_timeout = '5s';

create function public.create_income_transaction(
  p_request_id uuid,
  p_occurred_at timestamptz,
  p_description text,
  p_account_id uuid,
  p_amount numeric,
  p_category_id uuid,
  p_raw_text text default null,
  p_memo text default null
)
returns table (
  entry_id uuid,
  line_id uuid,
  replayed boolean
)
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
  v_account public.accounts%rowtype;
  v_category public.categories%rowtype;
  v_existing public.journal_entries%rowtype;
  v_line public.journal_lines%rowtype;
  v_line_count integer;
  v_impact_count integer;
  v_line_id uuid;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_request_id is null or p_account_id is null or p_category_id is null then
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

  -- Serialize application writes consistently with expense, transfer, budget,
  -- and reconciliation RPCs. The function performs no external work.
  perform pg_advisory_xact_lock(1782, 1);

  -- A committed request remains replayable even if its account or category is
  -- later disabled. A changed payload using the same UUID is always rejected.
  select e.* into v_existing
  from public.journal_entries e
  where e.id = p_request_id
  for update;
  if found then
    select count(*) into v_line_count
    from public.journal_lines l
    where l.entry_id = p_request_id;
    select l.* into v_line
    from public.journal_lines l
    where l.entry_id = p_request_id and l.sort_order = 0;
    select count(*) into v_impact_count
    from public.budget_impacts bi
    where bi.entry_id = p_request_id;

    if v_line_count <> 1 or v_line.id is null or v_impact_count <> 0
      or v_existing.entry_type <> 'income'
      or v_existing.status <> 'confirmed'
      or v_existing.source <> 'manual'
      or v_existing.occurred_at is distinct from p_occurred_at
      or v_existing.description is distinct from v_description
      or v_existing.raw_text is distinct from v_raw_text
      or v_existing.related_entry_id is not null
      or v_existing.exclude_from_budget
      or v_line.account_id is distinct from p_account_id
      or v_line.amount is distinct from p_amount
      or v_line.category_id is distinct from p_category_id
      or v_line.memo is distinct from v_memo
      or v_line.budget_bucket_id is not null then
      raise exception 'request_payload_conflict' using errcode = '22023';
    end if;

    return query select p_request_id, v_line.id, true;
    return;
  end if;

  select a.* into v_account
  from public.accounts a
  where a.id = p_account_id
  for share;
  if not found then
    raise exception 'account_not_found' using errcode = '22023';
  end if;
  if not v_account.is_active then
    raise exception 'account_inactive' using errcode = '22023';
  end if;
  if v_account.account_class <> 'asset' then
    raise exception 'income_account_must_be_asset' using errcode = '22023';
  end if;

  select c.* into v_category
  from public.categories c
  where c.id = p_category_id
  for share;
  if not found or not v_category.is_active or v_category.category_type <> 'income' then
    raise exception 'income_category_not_found_or_inactive' using errcode = '22023';
  end if;

  insert into public.journal_entries(
    id, occurred_at, entry_type, description, source, raw_text, status,
    related_entry_id, exclude_from_budget
  ) values (
    p_request_id, p_occurred_at, 'income', v_description, 'manual', v_raw_text,
    'confirmed', null, false
  );

  insert into public.journal_lines(
    entry_id, account_id, amount, category_id, memo, sort_order, budget_bucket_id
  ) values (
    p_request_id, p_account_id, p_amount, p_category_id, v_memo, 0, null
  ) returning id into v_line_id;

  return query select p_request_id, v_line_id, false;
end;
$income$;

revoke all on function public.create_income_transaction(
  uuid, timestamptz, text, uuid, numeric, uuid, text, text
) from public, anon;
grant execute on function public.create_income_transaction(
  uuid, timestamptz, text, uuid, numeric, uuid, text, text
) to authenticated;

commit;
