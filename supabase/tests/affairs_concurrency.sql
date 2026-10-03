-- ISOLATED PostgreSQL / psql ONLY. NEVER paste into Supabase SQL Editor.
-- Run once against a fresh local database named personal_os_affairs_isolated_test.
-- No production URL/password accepted by any application test runner.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'personal_os_affairs_isolated_test' then
  raise exception 'isolated_test_database_required';
 end if;
end $$;
\ir fixtures/transfer_base.sql
\ir fixtures/affairs_base.sql
\ir ../migrations/202610030005_affairs_foundation.sql
\ir ../migrations/202610030006_affairs_rewards.sql

insert into auth.users values ('c0000000-0000-0000-0000-000000000003');
create table public.affairs_test_scenarios (
 scenario text primary key, user_id uuid not null,
 task_id uuid, reward_id uuid, redemption_id uuid,
 observed_b_pid integer, observed_at timestamptz
);
revoke all on public.affairs_test_scenarios from public,anon,authenticated;
grant select on public.affairs_test_scenarios to authenticated;

do $$ declare r record; t uuid; rw uuid; i integer; begin
 perform set_config('request.jwt.claim.role','authenticated',false);
 perform set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false);
 select * into r from public.create_affairs_task(gen_random_uuid(),
  '{"title":"Race core","is_core":true,"core_reason":"Test","completion_criteria":"Done"}');
 insert into public.affairs_test_scenarios(scenario,user_id,task_id) values ('complete',auth.uid(),r.object_id);

 perform set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',false);
 for i in 1..4 loop
  select * into r from public.create_affairs_task(gen_random_uuid(),
   '{"title":"Funding core","is_core":true,"core_reason":"Test","completion_criteria":"Done"}');
  perform public.complete_affairs_task(gen_random_uuid(),r.object_id,1,true);
 end loop;
 select * into r from public.create_affairs_reward(gen_random_uuid(),'{"name":"Race reward","price_coins":3}');
 insert into public.affairs_test_scenarios(scenario,user_id,reward_id) values ('redeem',auth.uid(),r.object_id);

 perform set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000003',false);
 select * into r from public.create_affairs_task(gen_random_uuid(),
  '{"title":"Funding core","is_core":true,"core_reason":"Test","completion_criteria":"Done"}');
 t:=r.object_id; perform public.complete_affairs_task(gen_random_uuid(),t,1,true);
 select * into r from public.create_affairs_reward(gen_random_uuid(),'{"name":"Settle race","price_coins":1}');
 rw:=r.object_id;
 select * into r from public.redeem_affairs_reward(gen_random_uuid(),rw,1,1);
 insert into public.affairs_test_scenarios(scenario,user_id,task_id,reward_id,redemption_id) values ('settle',auth.uid(),t,rw,r.object_id);
end $$;

-- Test-only helper: executes the real authenticated public RPCs, never writes app tables.
create function public.affairs_test_race(p_scenario text,p_session text) returns text
language plpgsql security invoker set search_path='' as $$
declare s public.affairs_test_scenarios; r record; begin
 if current_database()<>'personal_os_affairs_isolated_test' then raise exception 'isolated_test_database_required'; end if;
 if p_session not in('a','b') then raise exception 'invalid_test_session'; end if;
 select * into strict s from public.affairs_test_scenarios where scenario=p_scenario;
 if auth.uid() is distinct from s.user_id then raise exception 'wrong_test_user'; end if;
 if p_scenario='complete' then
  select * into r from public.complete_affairs_task(gen_random_uuid(),s.task_id,1,true);
 elsif p_scenario='redeem' then
  select * into r from public.redeem_affairs_reward(gen_random_uuid(),s.reward_id,1,3);
 elsif p_scenario='settle' and p_session='a' then
  select * into r from public.use_affairs_redemption(gen_random_uuid(),s.redemption_id,1);
 elsif p_scenario='settle' then
  select * into r from public.cancel_affairs_redemption(gen_random_uuid(),s.redemption_id,1);
 else raise exception 'invalid_test_scenario'; end if;
 return 'success';
end $$;
revoke all on function public.affairs_test_race(text,text) from public,anon;
grant execute on function public.affairs_test_race(text,text) to authenticated;
create function public.affairs_test_lock_observed(p_observed_pid integer,p_observed_at timestamptz)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(p_observed_pid=pg_backend_pid() and p_observed_at>=transaction_timestamp(),false);
$$;
revoke all on function public.affairs_test_lock_observed(integer,timestamptz) from public,anon;
grant execute on function public.affairs_test_lock_observed(integer,timestamptz) to authenticated;
select 'Ready: run sessions A and B concurrently, once per scenario complete / redeem / settle' as instructions;
