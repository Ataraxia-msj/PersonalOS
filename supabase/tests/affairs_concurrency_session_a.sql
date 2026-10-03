-- psql local isolated database only; default complete, override -v scenario=redeem / settle.
\set ON_ERROR_STOP on
\if :{?scenario}
\else
\set scenario complete
\endif
do $$ begin
 if current_database()<>'personal_os_affairs_isolated_test' then raise exception 'isolated_test_database_required'; end if;
end $$;
begin;
set local statement_timeout='15s';
select set_config('request.jwt.claim.sub',user_id::text,true) from public.affairs_test_scenarios where scenario=:'scenario';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('affairs.test.scenario',:'scenario',true);
set local role authenticated;
select public.affairs_test_race(:'scenario','a');
-- RPC's wallet lock stays held until COMMIT. Local admin now observes B
-- truly blocked by this A; elapsed time alone is not concurrency evidence.
reset role;
do $$ declare v_scenario text:=current_setting('affairs.test.scenario'); b_pid integer; i integer; begin
 for i in 1..40 loop
  select pid into b_pid from pg_stat_activity
  where application_name='affairs_b_'||v_scenario and pg_backend_pid()=any(pg_blocking_pids(pid));
  if b_pid is not null then
   update public.affairs_test_scenarios set observed_b_pid=b_pid,observed_at=clock_timestamp() where scenario=v_scenario;
   return;
  end if;
  perform pg_sleep(0.25);
 end loop;
 raise exception 'concurrency_not_observed: B must start while A holds wallet lock';
end $$;
commit;
