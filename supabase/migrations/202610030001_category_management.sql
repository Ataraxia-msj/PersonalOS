-- REVIEW BEFORE EXECUTION. Adds authenticated category-management RPCs and one
-- nullable category column used to preserve immutable create-request payloads.
-- No View/RLS/table-grant changes and no historical data rewrite.
begin;
set local lock_timeout = '5s';

alter table public.categories
  add column if not exists creation_request_payload jsonb;

create function public.create_category(
  p_request_id uuid,
  p_name text,
  p_category_type text,
  p_default_budget_bucket_id uuid,
  p_sort_order integer,
  p_note text
)
returns table (category_id uuid, category_updated_at timestamptz, replayed boolean)
language plpgsql volatile security invoker
set search_path = '' set statement_timeout = '5s' set lock_timeout = '5s'
as $category_create$
declare
  v_name text := nullif(btrim(p_name), '');
  v_note text := nullif(btrim(p_note), '');
  v_existing public.categories%rowtype;
  v_payload jsonb;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'invalid_category_id' using errcode = '22023'; end if;
  if v_name is null or length(v_name) > 200 then raise exception 'invalid_category_name' using errcode = '22023'; end if;
  if p_category_type not in ('expense', 'income') then raise exception 'invalid_category_type' using errcode = '22023'; end if;
  if p_sort_order is null or p_sort_order < 0 then raise exception 'invalid_category_sort_order' using errcode = '22023'; end if;
  if coalesce(length(v_note), 0) > 1000 then raise exception 'invalid_category_note' using errcode = '22023'; end if;
  if p_category_type = 'income' and p_default_budget_bucket_id is not null then
    raise exception 'income_category_budget_bucket_forbidden' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object(
    'name', v_name, 'category_type', p_category_type,
    'default_budget_bucket_id', p_default_budget_bucket_id,
    'sort_order', p_sort_order, 'note', v_note
  );
  perform pg_advisory_xact_lock(1782, 1);
  select c.* into v_existing from public.categories c where c.id = p_request_id for update;
  if found then
    if v_existing.creation_request_payload is distinct from v_payload then
      raise exception 'request_payload_conflict' using errcode = '22023';
    end if;
    return query select v_existing.id, v_existing.updated_at, true;
    return;
  end if;

  if p_default_budget_bucket_id is not null and not exists (
    select 1 from public.budget_buckets b
    where b.id = p_default_budget_bucket_id and b.is_active and b.bucket_kind = 'expense'
  ) then
    raise exception 'invalid_default_budget_bucket' using errcode = '22023';
  end if;

  begin
    insert into public.categories (
      id, name, category_type, parent_id, default_budget_bucket_id,
      is_active, sort_order, note, creation_request_payload
    ) values (
      p_request_id, v_name, p_category_type, null, p_default_budget_bucket_id,
      true, p_sort_order, v_note, v_payload
    ) returning * into v_existing;
  exception when unique_violation then
    raise exception 'category_name_conflict' using errcode = '23505';
  end;
  return query select v_existing.id, v_existing.updated_at, false;
end;
$category_create$;

create function public.update_category(
  p_category_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_category_type text,
  p_default_budget_bucket_id uuid,
  p_sort_order integer,
  p_note text
)
returns table (category_id uuid, category_updated_at timestamptz, type_locked boolean)
language plpgsql volatile security invoker
set search_path = '' set statement_timeout = '5s' set lock_timeout = '5s'
as $category_update$
declare
  v_name text := nullif(btrim(p_name), '');
  v_note text := nullif(btrim(p_note), '');
  v_existing public.categories%rowtype;
  v_locked boolean;
  v_updated_at timestamptz;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_category_id is null or p_expected_updated_at is null then raise exception 'invalid_category_id' using errcode = '22023'; end if;
  if v_name is null or length(v_name) > 200 then raise exception 'invalid_category_name' using errcode = '22023'; end if;
  if p_category_type not in ('expense', 'income') then raise exception 'invalid_category_type' using errcode = '22023'; end if;
  if p_sort_order is null or p_sort_order < 0 then raise exception 'invalid_category_sort_order' using errcode = '22023'; end if;
  if coalesce(length(v_note), 0) > 1000 then raise exception 'invalid_category_note' using errcode = '22023'; end if;
  if p_category_type = 'income' and p_default_budget_bucket_id is not null then
    raise exception 'income_category_budget_bucket_forbidden' using errcode = '22023';
  end if;
  if p_default_budget_bucket_id is not null and not exists (
    select 1 from public.budget_buckets b
    where b.id = p_default_budget_bucket_id and b.is_active and b.bucket_kind = 'expense'
  ) then raise exception 'invalid_default_budget_bucket' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(1782, 1);
  select c.* into v_existing from public.categories c where c.id = p_category_id for update;
  if not found then raise exception 'category_not_found' using errcode = 'P0002'; end if;
  if v_existing.updated_at is distinct from p_expected_updated_at then raise exception 'stale_category' using errcode = '40001'; end if;
  select exists(select 1 from public.journal_lines l where l.category_id = p_category_id) into v_locked;
  if v_locked and p_category_type is distinct from v_existing.category_type then
    raise exception 'category_type_locked' using errcode = '22023';
  end if;

  begin
    update public.categories set
      name = v_name, category_type = p_category_type,
      default_budget_bucket_id = p_default_budget_bucket_id,
      sort_order = p_sort_order, note = v_note
    where id = p_category_id returning updated_at into v_updated_at;
  exception when unique_violation then
    raise exception 'category_name_conflict' using errcode = '23505';
  end;
  return query select p_category_id, v_updated_at, v_locked;
end;
$category_update$;

create function public.set_category_active(
  p_category_id uuid,
  p_expected_updated_at timestamptz,
  p_is_active boolean
)
returns table (category_id uuid, category_updated_at timestamptz, is_active boolean)
language plpgsql volatile security invoker
set search_path = '' set statement_timeout = '5s' set lock_timeout = '5s'
as $category_active$
declare v_existing public.categories%rowtype; v_updated_at timestamptz;
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_category_id is null or p_expected_updated_at is null or p_is_active is null then
    raise exception 'invalid_category_status' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(1782, 1);
  select c.* into v_existing from public.categories c where c.id = p_category_id for update;
  if not found then raise exception 'category_not_found' using errcode = 'P0002'; end if;
  if v_existing.updated_at is distinct from p_expected_updated_at then raise exception 'stale_category' using errcode = '40001'; end if;
  update public.categories set is_active = p_is_active where id = p_category_id returning updated_at into v_updated_at;
  return query select p_category_id, v_updated_at, p_is_active;
end;
$category_active$;

revoke all on function public.create_category(uuid,text,text,uuid,integer,text) from public, anon;
grant execute on function public.create_category(uuid,text,text,uuid,integer,text) to authenticated;
revoke all on function public.update_category(uuid,timestamptz,text,text,uuid,integer,text) from public, anon;
grant execute on function public.update_category(uuid,timestamptz,text,text,uuid,integer,text) to authenticated;
revoke all on function public.set_category_active(uuid,timestamptz,boolean) from public, anon;
grant execute on function public.set_category_active(uuid,timestamptz,boolean) to authenticated;

commit;
