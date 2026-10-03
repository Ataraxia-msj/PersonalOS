-- Affairs virtual rewards; never writes Finance. Apply after foundation.
begin;
do $$ begin
 if to_regclass('public.affairs_tasks') is null or to_regclass('public.affairs_coin_events') is not null
 or to_regclass('public.affairs_reward_items') is not null or to_regclass('public.affairs_redemptions') is not null or to_regclass('public.affairs_penalties') is not null
 or to_regclass('public.vw_affairs_coin_balance') is not null or to_regclass('public.vw_affairs_coin_ledger') is not null
 then raise exception 'affairs_rewards_object_conflict_or_missing_foundation'; end if;
end $$;
create table public.affairs_reward_items(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(user_id,id),revision bigint not null default 1 check(revision>=1),updated_at timestamptz not null default now(),
 name text not null check(char_length(btrim(name)) between 1 and 200 and name=btrim(name)),
 description text check(description is null or char_length(description) between 1 and 2000),
 price_coins int not null check(price_coins between 1 and 1000000),is_active boolean not null default true);
create table public.affairs_redemptions(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(user_id,id),revision bigint not null default 1 check(revision>=1),updated_at timestamptz not null default now(),
 reward_item_id uuid not null,foreign key(user_id,reward_item_id) references public.affairs_reward_items(user_id,id),
 name_snapshot text not null,price_snapshot int not null check(price_snapshot between 1 and 1000000),
 status text not null default 'available' check(status in('available','used','cancelled')),
 used_at timestamptz,cancelled_at timestamptz,charge_event_id uuid not null,refund_event_id uuid,
 check((status='used')=(used_at is not null)),check((status='cancelled')=(cancelled_at is not null)),
 check((status='cancelled')=(refund_event_id is not null)));
create table public.affairs_penalties(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(user_id,id),revision bigint not null default 1 check(revision>=1),updated_at timestamptz not null default now(),
 task_id uuid,foreign key(user_id,task_id) references public.affairs_tasks(user_id,id),
 reason text not null check(char_length(btrim(reason)) between 1 and 2000),
 occurred_at timestamptz not null,charge_event_id uuid not null,
 reversed_at timestamptz,reversed_reason text,reversal_event_id uuid,
 check((reversed_at is null)=(reversal_event_id is null)),check((reversed_at is null)=(reversed_reason is null)));
create table public.affairs_coin_events(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(user_id,id),
 wallet_sequence bigint not null check(wallet_sequence>0),unique(user_id,wallet_sequence),
 foreign key(user_id) references public.affairs_wallets(user_id),
 kind text not null check(kind in('task_reward','task_reward_reversal','redemption','redemption_refund','penalty','penalty_reversal')),
 amount int not null check(amount<>0),task_id uuid,redemption_id uuid,penalty_id uuid,reverses_event_id uuid,
 command_id uuid not null,description_snapshot text not null,posted_at timestamptz not null default now(),
 foreign key(user_id,task_id) references public.affairs_tasks(user_id,id),
 foreign key(user_id,redemption_id) references public.affairs_redemptions(user_id,id) deferrable initially deferred,
 foreign key(user_id,penalty_id) references public.affairs_penalties(user_id,id) deferrable initially deferred,
 foreign key(user_id,reverses_event_id) references public.affairs_coin_events(user_id,id) deferrable initially deferred,
 foreign key(user_id,command_id) references public.affairs_commands(user_id,id) deferrable initially deferred,
 check((kind in('task_reward','task_reward_reversal'))=(task_id is not null)),
 check((kind in('redemption','redemption_refund'))=(redemption_id is not null)),
 check((kind in('penalty','penalty_reversal'))=(penalty_id is not null)),
 check((kind in('task_reward_reversal','redemption_refund','penalty_reversal'))=(reverses_event_id is not null)),
 check((kind in('task_reward','penalty_reversal') and amount=1)
 or (kind in('task_reward_reversal','penalty') and amount=-1)
 or (kind='redemption' and amount<0) or (kind='redemption_refund' and amount>0)));
alter table public.affairs_redemptions add foreign key(user_id,charge_event_id) references public.affairs_coin_events(user_id,id) deferrable initially deferred;
alter table public.affairs_redemptions add foreign key(user_id,refund_event_id) references public.affairs_coin_events(user_id,id) deferrable initially deferred;
alter table public.affairs_penalties add foreign key(user_id,charge_event_id) references public.affairs_coin_events(user_id,id) deferrable initially deferred;
alter table public.affairs_penalties add foreign key(user_id,reversal_event_id) references public.affairs_coin_events(user_id,id) deferrable initially deferred;
create unique index affairs_one_reversal on public.affairs_coin_events(user_id,reverses_event_id) where reverses_event_id is not null;
create unique index affairs_redemption_charge on public.affairs_coin_events(user_id,redemption_id) where kind='redemption';
create unique index affairs_penalty_charge on public.affairs_coin_events(user_id,penalty_id) where kind='penalty';
create index affairs_coin_task on public.affairs_coin_events(user_id,task_id);
create index affairs_coin_redemption on public.affairs_coin_events(user_id,redemption_id);
create index affairs_coin_penalty on public.affairs_coin_events(user_id,penalty_id);
create index affairs_coin_command on public.affairs_coin_events(user_id,command_id);
create index affairs_coin_posted on public.affairs_coin_events(user_id,posted_at);
create index affairs_redemptions_item on public.affairs_redemptions(user_id,reward_item_id);
create index affairs_penalties_task on public.affairs_penalties(user_id,task_id);
create index affairs_penalties_occurred on public.affairs_penalties(user_id,occurred_at);
alter table public.affairs_reward_items enable row level security;
revoke all on public.affairs_reward_items from public,anon,authenticated;
grant select on public.affairs_reward_items to authenticated;
create policy owner_read on public.affairs_reward_items for select to authenticated using((select auth.uid())=user_id);
alter table public.affairs_redemptions enable row level security;
revoke all on public.affairs_redemptions from public,anon,authenticated;
grant select on public.affairs_redemptions to authenticated;
create policy owner_read on public.affairs_redemptions for select to authenticated using((select auth.uid())=user_id);
alter table public.affairs_penalties enable row level security;
revoke all on public.affairs_penalties from public,anon,authenticated;
grant select on public.affairs_penalties to authenticated;
create policy owner_read on public.affairs_penalties for select to authenticated using((select auth.uid())=user_id);
alter table public.affairs_coin_events enable row level security;
revoke all on public.affairs_coin_events from public,anon,authenticated;
grant select on public.affairs_coin_events to authenticated;
create policy owner_read on public.affairs_coin_events for select to authenticated using((select auth.uid())=user_id);
create or replace function affairs_private.coin_balance() returns bigint language sql stable security definer set search_path='' as $$
select coalesce(sum(amount),0)::bigint from public.affairs_coin_events where user_id=affairs_private.require_user();
$$;
create function affairs_private.append_coin_event(event uuid,cmd uuid,k text,delta int,task uuid,redemption uuid,penalty uuid,reversal uuid,description text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=affairs_private.require_user(); seq bigint;
begin
 update public.affairs_wallets set last_sequence=last_sequence+1 where user_id=u returning last_sequence into seq;
 if seq is null then raise exception 'invalid_state_transition'; end if;
 insert into public.affairs_coin_events(id,user_id,wallet_sequence,kind,amount,task_id,redemption_id,penalty_id,reverses_event_id,command_id,description_snapshot)
 values(event,u,seq,k,delta,task,redemption,penalty,reversal,cmd,description);
end $$;
create function affairs_private.rewards(op text,request uuid,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=affairs_private.lock_wallet(); a jsonb:=args; data jsonb; result jsonb; obj uuid; rev bigint; expected bigint;
 ta public.affairs_tasks; rw public.affairs_reward_items; rd public.affairs_redemptions; pn public.affairs_penalties;
 cmd uuid:=gen_random_uuid(); event uuid:=gen_random_uuid(); original uuid; delta int:=0; active_progress uuid; cycle bigint; v_reason text;
begin
 if op in('create_affairs_reward','update_affairs_reward') then
 data:=a->'payload'; perform affairs_private.check_keys(data,array['name','description','price_coins','is_active']);
 if jsonb_typeof(data->'name') is distinct from 'string' or jsonb_typeof(data->'price_coins') is distinct from 'number'
 or (data ? 'description' and jsonb_typeof(data->'description') not in('string','null'))
 or (data ? 'is_active' and jsonb_typeof(data->'is_active')<>'boolean')
 or (data->>'price_coins')::numeric<>trunc((data->>'price_coins')::numeric)
 or (data->>'price_coins')::numeric not between 1 and 1000000 then raise exception 'invalid_payload'; end if;
 data:=jsonb_build_object('name',affairs_private.clean_text(data->>'name',200,true),'description',affairs_private.clean_text(data->>'description',2000),'price_coins',(data->>'price_coins')::int,'is_active',coalesce((data->>'is_active')::boolean,true));
 a:=jsonb_set(a,'{payload}',data);
 elsif op in('undo_affairs_task_completion','record_affairs_penalty','reverse_affairs_penalty') then
 v_reason:=affairs_private.clean_text(a->>'reason',2000,true); a:=jsonb_set(a,'{reason}',to_jsonb(v_reason));
 end if;
 result:=affairs_private.replay(request,op,a); if result is not null then return result; end if;
 obj:=(a->>'id')::uuid; expected:=(a->>'expected_revision')::bigint;
 perform 1 from public.affairs_projects where user_id=u order by id for update;
 if op in('complete_affairs_task','reopen_affairs_task','undo_affairs_task_completion') then
 select * into ta from public.affairs_tasks where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if expected is distinct from ta.revision then raise exception 'stale_revision'; end if;
 perform affairs_private.assert_reference('project',ta.project_id,true);
 select id into active_progress from public.affairs_progress_entries where user_id=u and task_id=obj and kind='task_completion' and voided_at is null;
 if op='complete_affairs_task' then
 if ta.status not in('todo','in_progress','waiting') or coalesce((a->>'completion_confirmed')::boolean,false)=false then raise exception 'invalid_state_transition'; end if;
 cycle:=ta.completion_cycle;
 if active_progress is null then
 cycle:=cycle+1;
 insert into public.affairs_progress_entries(user_id,project_id,task_id,kind,content,occurred_at,completion_cycle)
 values(u,ta.project_id,obj,'task_completion',ta.title,now(),cycle);
 end if;
 if ta.is_core and ta.reward_state in('never','reversed') then
 delta:=1; perform affairs_private.append_coin_event(event,cmd,'task_reward',1,obj,null,null,null,ta.title);
 end if;
 update public.affairs_tasks set status='done',completed_at=now(),waiting_reason=null,ever_completed=true,completion_cycle=cycle,
 reward_state=case when is_core then 'awarded' else 'ineligible' end where id=obj;
 elsif op='reopen_affairs_task' then
 if ta.status<>'done' then raise exception 'invalid_state_transition'; end if;
 update public.affairs_tasks set status='todo',completed_at=null where id=obj;
 else
 if active_progress is null then raise exception 'already_reversed'; end if;
 if ta.is_core and ta.reward_state='awarded' then
 select e.id into original from public.affairs_coin_events e where e.user_id=u and e.task_id=obj and e.kind='task_reward'
 and not exists(select 1 from public.affairs_coin_events reversal where reversal.user_id=u and reversal.reverses_event_id=e.id);
 if original is null then raise exception 'invalid_state_transition'; end if;
 delta:=-1; perform affairs_private.append_coin_event(event,cmd,'task_reward_reversal',-1,obj,null,null,original,v_reason);
 end if;
 update public.affairs_progress_entries set voided_at=now(),voided_reason=v_reason where id=active_progress;
 update public.affairs_tasks set status='todo',completed_at=null,waiting_reason=null,reward_state=case when is_core then 'reversed' else 'ineligible' end where id=obj;
 end if;
 update public.affairs_tasks set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 elsif op in('create_affairs_reward','update_affairs_reward') then
 if op='create_affairs_reward' then
 insert into public.affairs_reward_items(user_id,name,description,price_coins,is_active) values(u,data->>'name',data->>'description',(data->>'price_coins')::int,(data->>'is_active')::boolean) returning id,revision into obj,rev;
 else
 select * into rw from public.affairs_reward_items where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if expected is distinct from rw.revision then raise exception 'stale_revision'; end if;
 update public.affairs_reward_items set name=data->>'name',description=data->>'description',price_coins=(data->>'price_coins')::int,is_active=(data->>'is_active')::boolean,revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 end if;
 elsif op='redeem_affairs_reward' then
 select * into rw from public.affairs_reward_items where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if expected is distinct from rw.revision or (a->>'confirmed_price')::int is distinct from rw.price_coins then raise exception 'reward_price_changed'; end if;
 if not rw.is_active then raise exception 'reward_unavailable'; end if;
 if affairs_private.coin_balance()<rw.price_coins then raise exception 'insufficient_coins'; end if;
 obj:=gen_random_uuid(); delta:=-rw.price_coins;
 insert into public.affairs_redemptions(id,user_id,reward_item_id,name_snapshot,price_snapshot,charge_event_id) values(obj,u,rw.id,rw.name,rw.price_coins,event) returning revision into rev;
 perform affairs_private.append_coin_event(event,cmd,'redemption',delta,null,obj,null,null,rw.name);
 elsif op in('use_affairs_redemption','cancel_affairs_redemption') then
 select * into rd from public.affairs_redemptions where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if rd.status='used' then raise exception 'redemption_already_used'; end if;
 if rd.status='cancelled' then raise exception 'already_reversed'; end if;
 if expected is distinct from rd.revision then raise exception 'stale_revision'; end if;
 if op='use_affairs_redemption' then
 update public.affairs_redemptions set status='used',used_at=now() where id=obj;
 else
 if not exists(select 1 from public.affairs_coin_events where user_id=u and id=rd.charge_event_id and redemption_id=obj and kind='redemption' and amount=-rd.price_snapshot) then raise exception 'invalid_state_transition'; end if;
 delta:=rd.price_snapshot; perform affairs_private.append_coin_event(event,cmd,'redemption_refund',delta,null,obj,null,rd.charge_event_id,rd.name_snapshot);
 update public.affairs_redemptions set status='cancelled',cancelled_at=now(),refund_event_id=event where id=obj;
 end if;
 update public.affairs_redemptions set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 elsif op='record_affairs_penalty' then
 if (a->>'occurred_at')::timestamptz is null or (a->>'occurred_at')::timestamptz>now() then raise exception 'invalid_payload'; end if;
 perform affairs_private.assert_reference('task',(a->>'task_id')::uuid);
 obj:=gen_random_uuid(); delta:=-1;
 insert into public.affairs_penalties(id,user_id,task_id,reason,occurred_at,charge_event_id) values(obj,u,(a->>'task_id')::uuid,v_reason,(a->>'occurred_at')::timestamptz,event) returning revision into rev;
 perform affairs_private.append_coin_event(event,cmd,'penalty',-1,null,null,obj,null,v_reason);
 elsif op='reverse_affairs_penalty' then
 select * into pn from public.affairs_penalties where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if pn.reversed_at is not null then raise exception 'already_reversed'; end if;
 if expected is distinct from pn.revision then raise exception 'stale_revision'; end if;
 if not exists(select 1 from public.affairs_coin_events where user_id=u and id=pn.charge_event_id and penalty_id=obj and kind='penalty' and amount=-1) then raise exception 'invalid_state_transition'; end if;
 delta:=1; perform affairs_private.append_coin_event(event,cmd,'penalty_reversal',1,null,null,obj,pn.charge_event_id,v_reason);
 update public.affairs_penalties set reversed_at=now(),reversed_reason=v_reason,reversal_event_id=event,revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 else raise exception 'invalid_payload'; end if;
 return affairs_private.receipt(request,op,a,obj,rev,delta,cmd);
end $$;
create function public.complete_affairs_task(p_request_id uuid,p_task_id uuid,p_expected_revision bigint,p_completion_confirmed boolean) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
select r.* from jsonb_to_record(affairs_private.rewards('complete_affairs_task',p_request_id,jsonb_build_object('id',p_task_id,'expected_revision',p_expected_revision,'completion_confirmed',p_completion_confirmed))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.complete_affairs_task(uuid,uuid,bigint,boolean) from public,anon;
grant execute on function public.complete_affairs_task(uuid,uuid,bigint,boolean) to authenticated;
create function public.reopen_affairs_task(p_request_id uuid,p_task_id uuid,p_expected_revision bigint) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
select r.* from jsonb_to_record(affairs_private.rewards('reopen_affairs_task',p_request_id,jsonb_build_object('id',p_task_id,'expected_revision',p_expected_revision))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.reopen_affairs_task(uuid,uuid,bigint) from public,anon;
grant execute on function public.reopen_affairs_task(uuid,uuid,bigint) to authenticated;
create function public.undo_affairs_task_completion(p_request_id uuid,p_task_id uuid,p_expected_revision bigint,p_reason text) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
select r.* from jsonb_to_record(affairs_private.rewards('undo_affairs_task_completion',p_request_id,jsonb_build_object('id',p_task_id,'expected_revision',p_expected_revision,'reason',p_reason))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.undo_affairs_task_completion(uuid,uuid,bigint,text) from public,anon;
grant execute on function public.undo_affairs_task_completion(uuid,uuid,bigint,text) to authenticated;
create function public.create_affairs_reward(p_request_id uuid,p_payload jsonb) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
select r.* from jsonb_to_record(affairs_private.rewards('create_affairs_reward',p_request_id,jsonb_build_object('payload',p_payload))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.create_affairs_reward(uuid,jsonb) from public,anon;
grant execute on function public.create_affairs_reward(uuid,jsonb) to authenticated;
create function public.update_affairs_reward(p_request_id uuid,p_reward_id uuid,p_expected_revision bigint,p_payload jsonb) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
select r.* from jsonb_to_record(affairs_private.rewards('update_affairs_reward',p_request_id,jsonb_build_object('id',p_reward_id,'expected_revision',p_expected_revision,'payload',p_payload))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.update_affairs_reward(uuid,uuid,bigint,jsonb) from public,anon;
grant execute on function public.update_affairs_reward(uuid,uuid,bigint,jsonb) to authenticated;
create function public.redeem_affairs_reward(p_request_id uuid,p_reward_id uuid,p_expected_revision bigint,p_confirmed_price integer) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
select r.* from jsonb_to_record(affairs_private.rewards('redeem_affairs_reward',p_request_id,jsonb_build_object('id',p_reward_id,'expected_revision',p_expected_revision,'confirmed_price',p_confirmed_price))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.redeem_affairs_reward(uuid,uuid,bigint,integer) from public,anon;
grant execute on function public.redeem_affairs_reward(uuid,uuid,bigint,integer) to authenticated;
create function public.record_affairs_penalty(p_request_id uuid,p_task_id uuid,p_reason text,p_occurred_at timestamptz) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
select r.* from jsonb_to_record(affairs_private.rewards('record_affairs_penalty',p_request_id,jsonb_build_object('task_id',p_task_id,'reason',p_reason,'occurred_at',p_occurred_at))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.record_affairs_penalty(uuid,uuid,text,timestamptz) from public,anon;
grant execute on function public.record_affairs_penalty(uuid,uuid,text,timestamptz) to authenticated;
create function public.reverse_affairs_penalty(p_request_id uuid,p_penalty_id uuid,p_expected_revision bigint,p_reason text) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
select r.* from jsonb_to_record(affairs_private.rewards('reverse_affairs_penalty',p_request_id,jsonb_build_object('id',p_penalty_id,'expected_revision',p_expected_revision,'reason',p_reason))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.reverse_affairs_penalty(uuid,uuid,bigint,text) from public,anon;
grant execute on function public.reverse_affairs_penalty(uuid,uuid,bigint,text) to authenticated;
create function public.use_affairs_redemption(p_request_id uuid,p_redemption_id uuid,p_expected_revision bigint) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
select r.* from jsonb_to_record(affairs_private.rewards('use_affairs_redemption',p_request_id,jsonb_build_object('id',p_redemption_id,'expected_revision',p_expected_revision))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.use_affairs_redemption(uuid,uuid,bigint) from public,anon;
grant execute on function public.use_affairs_redemption(uuid,uuid,bigint) to authenticated;
create function public.cancel_affairs_redemption(p_request_id uuid,p_redemption_id uuid,p_expected_revision bigint) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
select r.* from jsonb_to_record(affairs_private.rewards('cancel_affairs_redemption',p_request_id,jsonb_build_object('id',p_redemption_id,'expected_revision',p_expected_revision))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.cancel_affairs_redemption(uuid,uuid,bigint) from public,anon;
grant execute on function public.cancel_affairs_redemption(uuid,uuid,bigint) to authenticated;
create view public.vw_affairs_coin_balance with(security_invoker=true) as
select w.user_id,coalesce(sum(e.amount),0)::bigint balance_coins,w.last_sequence from public.affairs_wallets w left join public.affairs_coin_events e on e.user_id=w.user_id group by w.user_id,w.last_sequence;
create view public.vw_affairs_coin_ledger with(security_invoker=true) as
select e.*,sum(e.amount) over(partition by e.user_id order by e.wallet_sequence rows unbounded preceding)::bigint balance_after,
 coalesce(p.occurred_at,e.posted_at) occurred_at
from public.affairs_coin_events e left join public.affairs_penalties p on p.user_id=e.user_id and p.id=e.penalty_id;
revoke all on public.vw_affairs_coin_balance,public.vw_affairs_coin_ledger from public,anon;
grant select on public.vw_affairs_coin_balance,public.vw_affairs_coin_ledger to authenticated;
revoke all on all functions in schema affairs_private from public,anon,authenticated;
commit;
