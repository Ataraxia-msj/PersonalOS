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
set local role authenticated;
select public.affairs_test_race(:'scenario','a');
-- Hold wallet lock so B must wait for the same owner. Launch B within this interval.
select pg_sleep(5);
commit;
