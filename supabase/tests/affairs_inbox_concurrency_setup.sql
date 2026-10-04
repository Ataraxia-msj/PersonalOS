-- psql ONLY: fresh local isolated database, NEVER Supabase SQL Editor.
\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'personal_os_affairs_isolated_test' then raise exception 'isolated_test_database_required'; end if;
end $$;
\ir fixtures/transfer_base.sql
\ir fixtures/affairs_base.sql
\ir ../migrations/202610030005_affairs_foundation.sql
\ir ../migrations/202610030006_affairs_rewards.sql
\ir ../migrations/202610040001_affairs_inbox.sql
create table public.affairs_inbox_race(id uuid not null,observed_pid int,observed_at timestamptz);
revoke all on public.affairs_inbox_race from public,anon,authenticated;
grant select on public.affairs_inbox_race to authenticated;
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='a0000000-0000-0000-0000-000000000001';
insert into public.affairs_inbox_race(id) select object_id from public.create_affairs_inbox_entry(gen_random_uuid(),'Concurrent capture');
create function public.affairs_inbox_lock_observed(p_pid int,p_at timestamptz) returns boolean language sql stable set search_path='' as $$
 select coalesce(p_pid=pg_backend_pid() and p_at>=transaction_timestamp(),false)
$$;
revoke all on function public.affairs_inbox_lock_observed(int,timestamptz) from public,anon;
grant execute on function public.affairs_inbox_lock_observed(int,timestamptz) to authenticated;
