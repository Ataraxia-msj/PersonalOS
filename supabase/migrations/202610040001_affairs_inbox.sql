-- User-run incremental migration. Existing Affairs/Finance objects and data are preserved.
begin;
do $$ begin
 if current_setting('server_version_num')::int<150000 then raise exception 'PostgreSQL 15 required'; end if;
 if to_regclass('public.affairs_tasks') is null or to_regclass('public.affairs_coin_events') is null
 or to_regprocedure('affairs_private.metadata(text,jsonb)') is null then raise exception 'Deploy Affairs foundation and rewards first'; end if;
 if to_regclass('public.affairs_inbox_entries') is not null or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in('create_affairs_inbox_entry','update_affairs_inbox_entry','discard_affairs_inbox_entry','restore_affairs_inbox_entry','resolve_affairs_inbox_entry')) then raise exception 'Affairs inbox objects already exist; inspect deployment before retry'; end if;
end $$;

create table public.affairs_inbox_entries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 revision bigint not null default 1 check(revision>=1),
 content text not null check(char_length(content) between 1 and 4000 and content=btrim(content)),
 status text not null default 'pending' check(status in('pending','resolved','discarded')),
 resolved_task_id uuid,
 resolved_project_id uuid,
 resolved_at timestamptz,
 discarded_at timestamptz,
 unique(user_id,id),
 foreign key(user_id,resolved_task_id) references public.affairs_tasks(user_id,id),
 foreign key(user_id,resolved_project_id) references public.affairs_projects(user_id,id),
 constraint affairs_inbox_state check(
  (status='pending' and resolved_task_id is null and resolved_project_id is null and resolved_at is null and discarded_at is null)
  or (status='discarded' and resolved_task_id is null and resolved_project_id is null and resolved_at is null and discarded_at is not null)
  or (status='resolved' and num_nonnulls(resolved_task_id,resolved_project_id)=1 and resolved_at is not null and discarded_at is null)
 )
);
create index affairs_inbox_owner_status_created on public.affairs_inbox_entries(user_id,status,created_at desc,id);
create index affairs_inbox_task on public.affairs_inbox_entries(user_id,resolved_task_id) where resolved_task_id is not null;
create index affairs_inbox_project on public.affairs_inbox_entries(user_id,resolved_project_id) where resolved_project_id is not null;
alter table public.affairs_inbox_entries enable row level security;
revoke all on public.affairs_inbox_entries from public,anon,authenticated;
grant select on public.affairs_inbox_entries to authenticated;
create policy affairs_inbox_owner_read on public.affairs_inbox_entries for select to authenticated using(user_id=(select auth.uid()));

create function affairs_private.inbox_command(op text,request uuid,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=affairs_private.lock_wallet(); a jsonb:=args; result jsonb;
 item public.affairs_inbox_entries; obj uuid; rev bigint; expected bigint;
begin
 if op not in('create_affairs_inbox_entry','update_affairs_inbox_entry','discard_affairs_inbox_entry','restore_affairs_inbox_entry') or op is null then raise exception 'invalid_payload'; end if;
 perform affairs_private.check_keys(a,array['id','expected_revision','content']);
 if op in('create_affairs_inbox_entry','update_affairs_inbox_entry') then
  if jsonb_typeof(a->'content') is distinct from 'string' then raise exception 'invalid_payload'; end if;
  a:=jsonb_set(a,'{content}',to_jsonb(affairs_private.clean_text(regexp_replace(a->>'content','^[[:space:]]+|[[:space:]]+$','','g'),4000,true)));
 end if;
 result:=affairs_private.replay(request,op,a); if result is not null then return result; end if;
 if op='create_affairs_inbox_entry' then
  insert into public.affairs_inbox_entries(user_id,content) values(u,a->>'content') returning id,revision into obj,rev;
 else
  obj:=(a->>'id')::uuid; expected:=(a->>'expected_revision')::bigint;
  select * into item from public.affairs_inbox_entries where id=obj and user_id=u for update;
  if not found then raise exception 'not_found'; end if;
  if expected is distinct from item.revision then raise exception 'stale_revision'; end if;
  if op='restore_affairs_inbox_entry' then
   if item.status<>'discarded' then raise exception 'invalid_state_transition'; end if;
   update public.affairs_inbox_entries set status='pending',discarded_at=null where id=obj;
  else
   if item.status<>'pending' then raise exception 'invalid_state_transition'; end if;
   if op='update_affairs_inbox_entry' then update public.affairs_inbox_entries set content=a->>'content' where id=obj;
   else update public.affairs_inbox_entries set status='discarded',discarded_at=now() where id=obj; end if;
  end if;
  update public.affairs_inbox_entries set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 end if;
 return affairs_private.receipt(request,op,a,obj,rev);
end $$;
revoke all on function affairs_private.inbox_command(text,uuid,jsonb) from public,anon,authenticated;

create function public.create_affairs_inbox_entry(p_request_id uuid,p_content text)
returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean)
language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.inbox_command('create_affairs_inbox_entry',p_request_id,jsonb_build_object('content',p_content))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean)
$$;
create function public.update_affairs_inbox_entry(p_request_id uuid,p_inbox_id uuid,p_expected_revision bigint,p_content text)
returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean)
language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.inbox_command('update_affairs_inbox_entry',p_request_id,jsonb_build_object('id',p_inbox_id,'expected_revision',p_expected_revision,'content',p_content))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean)
$$;
create function public.discard_affairs_inbox_entry(p_request_id uuid,p_inbox_id uuid,p_expected_revision bigint)
returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean)
language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.inbox_command('discard_affairs_inbox_entry',p_request_id,jsonb_build_object('id',p_inbox_id,'expected_revision',p_expected_revision))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean)
$$;
create function public.restore_affairs_inbox_entry(p_request_id uuid,p_inbox_id uuid,p_expected_revision bigint)
returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean)
language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.inbox_command('restore_affairs_inbox_entry',p_request_id,jsonb_build_object('id',p_inbox_id,'expected_revision',p_expected_revision))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean)
$$;
revoke all on function public.create_affairs_inbox_entry(uuid,text),public.update_affairs_inbox_entry(uuid,uuid,bigint,text),public.discard_affairs_inbox_entry(uuid,uuid,bigint),public.restore_affairs_inbox_entry(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.create_affairs_inbox_entry(uuid,text),public.update_affairs_inbox_entry(uuid,uuid,bigint,text),public.discard_affairs_inbox_entry(uuid,uuid,bigint),public.restore_affairs_inbox_entry(uuid,uuid,bigint) to authenticated;
-- AFFAIRS_INBOX_RESOLVE_START
create function affairs_private.resolve_inbox(request uuid,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=affairs_private.require_user(); a jsonb:=args; data jsonb; v_result jsonb;
 item public.affairs_inbox_entries; obj uuid; rev bigint; target_id uuid; target_rev bigint; kind text;
 description_value text;
begin
 perform affairs_private.check_keys(a,array['id','expected_revision','target','payload']);
 kind:=a->>'target';
 if kind is null or kind not in('task','project') then raise exception 'invalid_payload'; end if;
 data:=affairs_private.metadata(kind,a->'payload'); a:=jsonb_set(a,'{payload}',data);
 perform affairs_private.lock_wallet();
 v_result:=affairs_private.replay(request,'resolve_affairs_inbox_entry',a); if v_result is not null then return v_result; end if;
 -- Same global order as the existing Affairs RPCs: wallet → projects → target.
 perform 1 from public.affairs_projects where user_id=u order by id for update;
 obj:=(a->>'id')::uuid;
 select * into item from public.affairs_inbox_entries where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if (a->>'expected_revision')::bigint is distinct from item.revision then raise exception 'stale_revision'; end if;
 if item.status<>'pending' then raise exception 'invalid_state_transition'; end if;
 description_value:=affairs_private.clean_text(case
  when data->>'description' is null or data->>'description'=item.content then item.content
  else (data->>'description')||E'\n\n'||item.content end,10000,true);
 if kind='task' then
  perform affairs_private.assert_reference('project',(data->>'project_id')::uuid,true);
  insert into public.affairs_tasks(user_id,project_id,title,description,is_core,core_reason,completion_criteria,due_date)
  values(u,(data->>'project_id')::uuid,data->>'title',description_value,(data->>'is_core')::boolean,data->>'core_reason',data->>'completion_criteria',(data->>'due_date')::date)
  returning id,revision into target_id,target_rev;
 else
  perform affairs_private.assert_reference('mainline',(data->>'mainline_id')::uuid);
  insert into public.affairs_projects(user_id,mainline_id,name,outcome,description,due_date)
  values(u,(data->>'mainline_id')::uuid,data->>'name',data->>'outcome',description_value,(data->>'due_date')::date)
  returning id,revision into target_id,target_rev;
 end if;
 update public.affairs_inbox_entries set status='resolved',resolved_task_id=case when kind='task' then target_id end,
 resolved_project_id=case when kind='project' then target_id end,resolved_at=now(),revision=revision+1,updated_at=now()
 where id=obj returning revision into rev;
 v_result:=affairs_private.receipt(request,'resolve_affairs_inbox_entry',a,obj,rev)||jsonb_build_object('resolved_resource',kind,'resolved_object_id',target_id,'resolved_object_revision',target_rev);
 update public.affairs_commands set result=v_result where id=(v_result->>'command_id')::uuid and user_id=u;
 return v_result;
end $$;
revoke all on function affairs_private.resolve_inbox(uuid,jsonb) from public,anon,authenticated;
create function public.resolve_affairs_inbox_entry(p_request_id uuid,p_inbox_id uuid,p_expected_revision bigint,p_target text,p_payload jsonb)
returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean,resolved_resource text,resolved_object_id uuid,resolved_object_revision bigint)
language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.resolve_inbox(p_request_id,jsonb_build_object('id',p_inbox_id,'expected_revision',p_expected_revision,'target',p_target,'payload',p_payload)))
 as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean,resolved_resource text,resolved_object_id uuid,resolved_object_revision bigint)
$$;
revoke all on function public.resolve_affairs_inbox_entry(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.resolve_affairs_inbox_entry(uuid,uuid,bigint,text,jsonb) to authenticated;
commit;
