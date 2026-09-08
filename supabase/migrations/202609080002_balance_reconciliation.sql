-- Balance calibration: new RPCs only. No table columns, View definitions,
-- historical rows, table grants, or RLS policies are changed.
-- Apply after reviewing against balance_reconciliation_preflight_v1.
begin;

create or replace function public.preview_balance_reconciliation(
  p_account_id uuid,
  p_snapshot_at timestamptz
)
returns table (
  account_id uuid,
  snapshot_at timestamptz,
  estimated_balance numeric,
  latest_snapshot_id uuid,
  has_later_snapshot boolean,
  currency text,
  account_class text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_account public.accounts%rowtype;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_snapshot_at is null or not isfinite(p_snapshot_at) or p_snapshot_at > now() then
    raise exception 'invalid_snapshot_time' using errcode = '22023';
  end if;
  select a.* into v_account from public.accounts a where a.id = p_account_id;
  if not found then raise exception 'account_not_found' using errcode = '22023'; end if;
  if not v_account.is_active then raise exception 'account_inactive' using errcode = '22023'; end if;

  -- One statement reads a consistent as-of baseline. VOLATILE is intentional:
  -- save calls this after acquiring its lock and needs a fresh command snapshot.
  return query
    select p_account_id, p_snapshot_at,
      coalesce(basis.balance, 0::numeric) + coalesce(changes.amount, 0::numeric),
      newest.id, coalesce(newest.snapshot_at > p_snapshot_at, false),
      v_account.currency, v_account.account_class
    from (values (1)) anchor(n)
    left join lateral (
      select bs.balance, bs.snapshot_at from public.balance_snapshots bs
      where bs.account_id = p_account_id and bs.snapshot_at <= p_snapshot_at
      order by bs.snapshot_at desc limit 1
    ) basis on true
    left join lateral (
      select sum(jl.amount) as amount from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id
      where jl.account_id = p_account_id and je.status = 'confirmed'
        and je.occurred_at <= p_snapshot_at
        and (basis.snapshot_at is null or je.occurred_at > basis.snapshot_at)
    ) changes on true
    left join lateral (
      select bs.id, bs.snapshot_at from public.balance_snapshots bs
      where bs.account_id = p_account_id and bs.snapshot_at <= now()
      order by bs.snapshot_at desc limit 1
    ) newest on true;
end;
$$;

create or replace function public.reconcile_account_balance(
  p_request_id uuid,
  p_account_id uuid,
  p_snapshot_at timestamptz,
  p_balance numeric,
  p_note text,
  p_expected_balance numeric,
  p_expected_snapshot_id uuid
)
returns table (
  snapshot_id uuid, account_id uuid, snapshot_at timestamptz, balance numeric, replayed boolean
)
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_existing public.balance_snapshots%rowtype;
  v_preview record;
  v_note text := nullif(btrim(p_note), '');
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_request_id is null or p_account_id is null then
    raise exception 'invalid_reconciliation_id' using errcode = '22023';
  end if;
  if p_snapshot_at is null or not isfinite(p_snapshot_at) or p_snapshot_at > now() then
    raise exception 'invalid_snapshot_time' using errcode = '22023';
  end if;
  if p_balance is null or p_balance::text in ('NaN', 'Infinity', '-Infinity')
     or p_balance < 0 or p_balance > 999999999999.99 or p_balance <> round(p_balance, 2) then
    raise exception 'invalid_snapshot_balance' using errcode = '22023';
  end if;
  if length(v_note) > 1000 then raise exception 'snapshot_note_too_long' using errcode = '22023'; end if;

  -- Same short transaction lock as the existing finance write RPCs.
  -- It does NOT prevent future editing of older transactions.
  perform pg_advisory_xact_lock(1782, 1);

  -- The existing snapshot primary key is the idempotency key. No extra column.
  select bs.* into v_existing from public.balance_snapshots bs where bs.id = p_request_id;
  if found then
    if v_existing.account_id <> p_account_id or v_existing.snapshot_at <> p_snapshot_at
       or v_existing.balance <> p_balance or v_existing.note is distinct from v_note
       or v_existing.source <> 'manual' then
      raise exception 'request_payload_conflict' using errcode = '22023';
    end if;
    return query select v_existing.id, v_existing.account_id, v_existing.snapshot_at, v_existing.balance, true;
    return;
  end if;

  perform 1 from public.accounts a where a.id = p_account_id for share;
  select * into v_preview from public.preview_balance_reconciliation(p_account_id, p_snapshot_at);
  if p_expected_balance is null or v_preview.estimated_balance is distinct from p_expected_balance
     or v_preview.latest_snapshot_id is distinct from p_expected_snapshot_id then
    raise exception 'stale_reconciliation_preview' using errcode = '40001';
  end if;
  if exists (select 1 from public.balance_snapshots bs where bs.account_id = p_account_id and bs.snapshot_at = p_snapshot_at) then
    raise exception 'snapshot_time_conflict' using errcode = '23505';
  end if;

  insert into public.balance_snapshots (id, account_id, snapshot_at, balance, source, note)
  values (p_request_id, p_account_id, p_snapshot_at, p_balance, 'manual', v_note);
  return query select p_request_id, p_account_id, p_snapshot_at, p_balance, false;
end;
$$;

revoke all on function public.preview_balance_reconciliation(uuid, timestamptz) from public, anon;
grant execute on function public.preview_balance_reconciliation(uuid, timestamptz) to authenticated;
revoke all on function public.reconcile_account_balance(uuid, uuid, timestamptz, numeric, text, numeric, uuid) from public, anon;
grant execute on function public.reconcile_account_balance(uuid, uuid, timestamptz, numeric, text, numeric, uuid) to authenticated;

commit;
