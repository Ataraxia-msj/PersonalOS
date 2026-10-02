-- REVIEW BEFORE EXECUTION. Adds authenticated account-management RPCs only.
-- No table/View/RLS/table-grant changes and no historical data rewrite.
begin;
set local lock_timeout = '5s';

create function public.create_account(
  p_request_id uuid,
  p_name text,
  p_account_class text,
  p_account_type text,
  p_currency text,
  p_institution text,
  p_include_in_net_worth boolean,
  p_sort_order integer,
  p_note text,
  p_initial_balance numeric,
  p_balance_at timestamptz
)
returns table (
  account_id uuid,
  snapshot_id uuid,
  account_updated_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '5s'
as $account_create$
declare
  v_name text := nullif(btrim(p_name), '');
  v_institution text := nullif(btrim(p_institution), '');
  v_note text := nullif(btrim(p_note), '');
  v_existing public.accounts%rowtype;
  v_snapshot public.balance_snapshots%rowtype;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'invalid_account_id' using errcode = '22023';
  end if;
  if v_name is null or length(v_name) > 200 then
    raise exception 'invalid_account_name' using errcode = '22023';
  end if;
  if coalesce(length(v_institution), 0) > 200
    or coalesce(length(v_note), 0) > 1000 then
    raise exception 'invalid_account_text' using errcode = '22023';
  end if;
  if p_account_class not in ('asset', 'liability')
    or not (
      (p_account_class = 'asset' and p_account_type in (
        'cash', 'bank', 'ewallet', 'wallet_pocket', 'money_market',
        'time_deposit', 'investment', 'receivable', 'other'
      ))
      or (p_account_class = 'liability' and p_account_type in (
        'credit_card', 'consumer_credit', 'loan', 'payable', 'other'
      ))
    ) then
    raise exception 'invalid_account_class_type' using errcode = '22023';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_account_currency' using errcode = '22023';
  end if;
  if p_include_in_net_worth is null then
    raise exception 'invalid_include_in_net_worth' using errcode = '22023';
  end if;
  if p_sort_order is null or p_sort_order < 0 then
    raise exception 'invalid_account_sort_order' using errcode = '22023';
  end if;
  if p_initial_balance is null
    or p_initial_balance::text in ('NaN', 'Infinity', '-Infinity')
    or p_initial_balance < 0 or p_initial_balance > 999999999999.99
    or p_initial_balance <> round(p_initial_balance, 2) then
    raise exception 'invalid_initial_balance' using errcode = '22023';
  end if;
  if p_balance_at is null or not isfinite(p_balance_at) or p_balance_at > now() then
    raise exception 'invalid_balance_time' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(1782, 1);

  select a.* into v_existing
  from public.accounts a
  where a.id = p_request_id
  for update;
  if found then
    select bs.* into v_snapshot
    from public.balance_snapshots bs
    where bs.id = p_request_id;

    if v_snapshot.id is null
      or v_existing.name is distinct from v_name
      or v_existing.account_class is distinct from p_account_class
      or v_existing.account_type is distinct from p_account_type
      or v_existing.currency is distinct from p_currency
      or v_existing.institution is distinct from v_institution
      or v_existing.include_in_net_worth is distinct from p_include_in_net_worth
      or v_existing.sort_order is distinct from p_sort_order
      or v_existing.note is distinct from v_note
      or v_snapshot.account_id is distinct from p_request_id
      or v_snapshot.snapshot_at is distinct from p_balance_at
      or v_snapshot.balance is distinct from p_initial_balance
      or v_snapshot.source <> 'manual'
      or v_snapshot.note is distinct from v_note then
      raise exception 'request_payload_conflict' using errcode = '22023';
    end if;

    return query select v_existing.id, v_snapshot.id, v_existing.updated_at, true;
    return;
  end if;

  begin
    insert into public.accounts (
      id, name, account_class, account_type, currency, institution,
      include_in_net_worth, is_active, sort_order, note
    ) values (
      p_request_id, v_name, p_account_class, p_account_type, p_currency,
      v_institution, p_include_in_net_worth, true, p_sort_order, v_note
    ) returning * into v_existing;
  exception when unique_violation then
    raise exception 'account_name_conflict' using errcode = '23505';
  end;

  insert into public.balance_snapshots (
    id, account_id, snapshot_at, balance, source, note
  ) values (
    p_request_id, p_request_id, p_balance_at, p_initial_balance, 'manual', v_note
  ) returning * into v_snapshot;

  return query select v_existing.id, v_snapshot.id, v_existing.updated_at, false;
end;
$account_create$;

create function public.update_account(
  p_account_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_account_class text,
  p_account_type text,
  p_currency text,
  p_institution text,
  p_include_in_net_worth boolean,
  p_sort_order integer,
  p_note text
)
returns table (
  account_id uuid,
  account_updated_at timestamptz,
  structure_locked boolean
)
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '5s'
as $account_update$
declare
  v_name text := nullif(btrim(p_name), '');
  v_institution text := nullif(btrim(p_institution), '');
  v_note text := nullif(btrim(p_note), '');
  v_existing public.accounts%rowtype;
  v_updated_at timestamptz;
  v_locked boolean;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_account_id is null or p_expected_updated_at is null then
    raise exception 'invalid_account_id' using errcode = '22023';
  end if;
  if v_name is null or length(v_name) > 200 then
    raise exception 'invalid_account_name' using errcode = '22023';
  end if;
  if coalesce(length(v_institution), 0) > 200
    or coalesce(length(v_note), 0) > 1000 then
    raise exception 'invalid_account_text' using errcode = '22023';
  end if;
  if p_account_class not in ('asset', 'liability')
    or not (
      (p_account_class = 'asset' and p_account_type in (
        'cash', 'bank', 'ewallet', 'wallet_pocket', 'money_market',
        'time_deposit', 'investment', 'receivable', 'other'
      ))
      or (p_account_class = 'liability' and p_account_type in (
        'credit_card', 'consumer_credit', 'loan', 'payable', 'other'
      ))
    ) then
    raise exception 'invalid_account_class_type' using errcode = '22023';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_account_currency' using errcode = '22023';
  end if;
  if p_include_in_net_worth is null then
    raise exception 'invalid_include_in_net_worth' using errcode = '22023';
  end if;
  if p_sort_order is null or p_sort_order < 0 then
    raise exception 'invalid_account_sort_order' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(1782, 1);

  select a.* into v_existing
  from public.accounts a
  where a.id = p_account_id
  for update;
  if not found then
    raise exception 'account_not_found' using errcode = '22023';
  end if;
  if v_existing.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_account' using errcode = '40001';
  end if;

  v_locked := exists (
    select 1 from public.balance_snapshots bs where bs.account_id = p_account_id
  ) or exists (
    select 1 from public.journal_lines jl where jl.account_id = p_account_id
  );

  if v_locked and (
    v_existing.account_class is distinct from p_account_class
    or v_existing.account_type is distinct from p_account_type
    or v_existing.currency is distinct from p_currency
  ) then
    raise exception 'account_structure_locked' using errcode = '22023';
  end if;

  begin
    update public.accounts
    set name = v_name,
        account_class = p_account_class,
        account_type = p_account_type,
        currency = p_currency,
        institution = v_institution,
        include_in_net_worth = p_include_in_net_worth,
        sort_order = p_sort_order,
        note = v_note
    where id = p_account_id
    returning updated_at into v_updated_at;
  exception when unique_violation then
    raise exception 'account_name_conflict' using errcode = '23505';
  end;

  return query select p_account_id, v_updated_at, v_locked;
end;
$account_update$;

create function public.set_account_active(
  p_account_id uuid,
  p_expected_updated_at timestamptz,
  p_is_active boolean
)
returns table (
  account_id uuid,
  account_updated_at timestamptz,
  is_active boolean
)
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '5s'
as $account_active$
declare
  v_existing public.accounts%rowtype;
  v_updated_at timestamptz;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_account_id is null or p_expected_updated_at is null or p_is_active is null then
    raise exception 'invalid_account_status' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(1782, 1);

  select a.* into v_existing
  from public.accounts a
  where a.id = p_account_id
  for update;
  if not found then
    raise exception 'account_not_found' using errcode = '22023';
  end if;
  if v_existing.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_account' using errcode = '40001';
  end if;

  update public.accounts
  set is_active = p_is_active
  where id = p_account_id
  returning updated_at into v_updated_at;

  return query select p_account_id, v_updated_at, p_is_active;
end;
$account_active$;

revoke all on function public.create_account(
  uuid, text, text, text, text, text, boolean, integer, text, numeric, timestamptz
) from public, anon;
grant execute on function public.create_account(
  uuid, text, text, text, text, text, boolean, integer, text, numeric, timestamptz
) to authenticated;

revoke all on function public.update_account(
  uuid, timestamptz, text, text, text, text, text, boolean, integer, text
) from public, anon;
grant execute on function public.update_account(
  uuid, timestamptz, text, text, text, text, text, boolean, integer, text
) to authenticated;

revoke all on function public.set_account_active(uuid, timestamptz, boolean)
from public, anon;
grant execute on function public.set_account_active(uuid, timestamptz, boolean)
to authenticated;

commit;
