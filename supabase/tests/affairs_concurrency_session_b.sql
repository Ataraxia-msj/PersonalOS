-- Run while A holds its lock. Do not repeat a scenario after its state has changed.
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
select set_config('request.jwt.claim.sub',user_id::text,true),set_config('affairs.test.scenario',scenario,true)
from public.affairs_test_scenarios where scenario=:'scenario';
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$ declare v_scenario text:=current_setting('affairs.test.scenario'); s public.affairs_test_scenarios; result text; bal bigint; begin
 select * into strict s from public.affairs_test_scenarios where scenario=v_scenario;
 begin
  result:=public.affairs_test_race(v_scenario,'b');
 exception when others then
  if (v_scenario='complete' and sqlerrm='stale_revision') or
     (v_scenario='redeem' and sqlerrm='insufficient_coins') or
     (v_scenario='settle' and sqlerrm='redemption_already_used') then result:=sqlerrm;
  else raise; end if;
 end;
 if result='success' then raise exception 'B did not wait for A; run A first and B during its sleep'; end if;
 select balance_coins into bal from public.vw_affairs_coin_balance where user_id=auth.uid();
 if v_scenario='complete' then
  if bal<>1 or (select count(*) from public.affairs_coin_events where task_id=s.task_id and kind='task_reward')<>1
   or (select count(*) from public.affairs_progress_entries where task_id=s.task_id and voided_at is null)<>1
  then raise exception 'duplicate_completion_reward'; end if;
 elsif v_scenario='redeem' then
  if bal<>1 or (select count(*) from public.affairs_redemptions where reward_item_id=s.reward_id)<>1
  then raise exception 'redemption_overspend'; end if;
 else
  if bal<>0 or (select status from public.affairs_redemptions where id=s.redemption_id)<>'used'
   or exists(select 1 from public.affairs_coin_events where redemption_id=s.redemption_id and kind='redemption_refund')
  then raise exception 'use_cancel_race_invalid'; end if;
 end if;
 if exists(select 1 from public.vw_affairs_coin_ledger l where balance_after<>
  (select sum(e.amount) from public.affairs_coin_events e where e.wallet_sequence<=l.wallet_sequence))
 then raise exception 'ledger_balance_mismatch'; end if;
 raise notice 'PASS scenario %, loser %, balance %',v_scenario,result,bal;
end $$;
commit;
