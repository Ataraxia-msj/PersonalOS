-- Two psql terminals: A -v leader=true, then B -v leader=false while A waits.
\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'personal_os_affairs_isolated_test' then raise exception 'isolated_test_database_required'; end if;
end $$;
begin;
set local statement_timeout='15s';
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='a0000000-0000-0000-0000-000000000001';
\if :leader
set local role authenticated;
select r.* from public.affairs_inbox_race s cross join lateral public.resolve_affairs_inbox_entry(gen_random_uuid(),s.id,1,'task','{"title":"Race task"}') r;
reset role;
do $$ declare b_pid int; i int; begin
 for i in 1..40 loop
  select pid into b_pid from pg_stat_activity where application_name='affairs_inbox_b' and pg_backend_pid()=any(pg_blocking_pids(pid));
  if b_pid is not null then update public.affairs_inbox_race set observed_pid=b_pid,observed_at=clock_timestamp(); return; end if;
  perform pg_sleep(0.25);
 end loop;
 raise exception 'concurrency_not_observed';
end $$;
\else
set local application_name='affairs_inbox_b';
set local role authenticated;
do $$ declare s public.affairs_inbox_race; begin
 select * into strict s from public.affairs_inbox_race;
 begin
  perform * from public.resolve_affairs_inbox_entry(gen_random_uuid(),s.id,1,'task','{"title":"Race task B"}');
  raise exception 'duplicate_target';
 exception when raise_exception then if sqlerrm<>'stale_revision' then raise; end if; end;
 select * into strict s from public.affairs_inbox_race;
 if not public.affairs_inbox_lock_observed(s.observed_pid,s.observed_at) then raise exception 'concurrency_not_observed'; end if;
 if (select count(*) from public.affairs_tasks)<>1 or (select count(*) from public.affairs_commands where operation='resolve_affairs_inbox_entry')<>1 then raise exception 'duplicate_target'; end if;
 if exists(select 1 from public.affairs_coin_events) or exists(select 1 from public.affairs_progress_entries) then raise exception 'unexpected_reward'; end if;
 raise notice 'PASS concurrent resolve: one target, one resolve command, real lock wait observed';
end $$;
\endif
commit;
