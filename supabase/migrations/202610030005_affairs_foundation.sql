-- Affairs phase one foundation. User-run; no Finance mutations, no seeds.
begin;
do $$ begin
 if current_setting('server_version_num')::int<150000 then raise exception 'PostgreSQL 15 required'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and (c.relname like 'affairs_%' or c.relname like 'vw_affairs_%'))
 or exists(select 1 from pg_namespace where nspname='affairs_private')
 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%affairs%')
 then raise exception 'affairs_object_conflict: inspect existing objects first'; end if;
end $$;
create schema affairs_private;
revoke all on schema affairs_private from public,anon,authenticated;
create table public.affairs_mainlines (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(user_id,id),
 updated_at timestamptz not null default now(),
  revision bigint not null default 1 check(revision>=1), name text not null check(char_length(btrim(name)) between 1 and 200 and name=btrim(name)), description text check(description is null or (char_length(btrim(description)) between 1 and 10000 and description=btrim(description))),
 status text not null default 'active' check(status in('active','paused','archived')),
 sort_order integer not null default 0 check(sort_order>=0), focus_project_id uuid);

alter table public.affairs_mainlines enable row level security;
revoke all on table public.affairs_mainlines from public,anon,authenticated;
grant select on table public.affairs_mainlines to authenticated;
create policy owner_read on public.affairs_mainlines for select to authenticated using((select auth.uid())=user_id);
create table public.affairs_projects (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(user_id,id),
 updated_at timestamptz not null default now(),
  revision bigint not null default 1 check(revision>=1), mainline_id uuid, foreign key(user_id,mainline_id) references public.affairs_mainlines(user_id,id), name text not null check(char_length(btrim(name)) between 1 and 200 and name=btrim(name)),
 outcome text not null check(outcome is null or (char_length(btrim(outcome)) between 1 and 2000 and outcome=btrim(outcome))), description text check(description is null or (char_length(btrim(description)) between 1 and 10000 and description=btrim(description))), due_date date,
 status text not null default 'active' check(status in('active','paused','completed','archived')),
 completed_at timestamptz, check((status='completed')=(completed_at is not null)));

alter table public.affairs_projects enable row level security;
revoke all on table public.affairs_projects from public,anon,authenticated;
grant select on table public.affairs_projects to authenticated;
create policy owner_read on public.affairs_projects for select to authenticated using((select auth.uid())=user_id);
create table public.affairs_milestones (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(user_id,id),
 updated_at timestamptz not null default now(),
  revision bigint not null default 1 check(revision>=1), project_id uuid not null, foreign key(user_id,project_id) references public.affairs_projects(user_id,id), title text not null check(char_length(btrim(title)) between 1 and 200 and title=btrim(title)),
 completion_criteria text not null check(completion_criteria is null or (char_length(btrim(completion_criteria)) between 1 and 2000 and completion_criteria=btrim(completion_criteria))), sort_order integer not null default 0 check(sort_order>=0),
 status text not null default 'pending' check(status in('pending','completed')),
 completed_at timestamptz, check((status='completed')=(completed_at is not null)));

alter table public.affairs_milestones enable row level security;
revoke all on table public.affairs_milestones from public,anon,authenticated;
grant select on table public.affairs_milestones to authenticated;
create policy owner_read on public.affairs_milestones for select to authenticated using((select auth.uid())=user_id);
create table public.affairs_tasks (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(user_id,id),
 updated_at timestamptz not null default now(),
  revision bigint not null default 1 check(revision>=1), project_id uuid, foreign key(user_id,project_id) references public.affairs_projects(user_id,id), title text not null check(char_length(btrim(title)) between 1 and 200 and title=btrim(title)),
 description text check(description is null or (char_length(btrim(description)) between 1 and 10000 and description=btrim(description))), is_core boolean not null default false,
 core_reason text check(core_reason is null or (char_length(btrim(core_reason)) between 1 and 2000 and core_reason=btrim(core_reason))), completion_criteria text check(completion_criteria is null or (char_length(btrim(completion_criteria)) between 1 and 2000 and completion_criteria=btrim(completion_criteria))),
 status text not null default 'todo' check(status in('todo','in_progress','waiting','done','cancelled')),
 waiting_reason text check(waiting_reason is null or (char_length(btrim(waiting_reason)) between 1 and 2000 and waiting_reason=btrim(waiting_reason))), due_date date, completed_at timestamptz,
 ever_completed boolean not null default false, completion_cycle bigint not null default 0 check(completion_cycle>=0),
 reward_state text not null default 'never' check(reward_state in('never','awarded','reversed','ineligible')),
 check(not is_core or (core_reason is not null and completion_criteria is not null)),
 check((status='done')=(completed_at is not null)),
 check(status='waiting' or waiting_reason is null),
 check(not ever_completed or completion_cycle>0));

alter table public.affairs_tasks enable row level security;
revoke all on table public.affairs_tasks from public,anon,authenticated;
grant select on table public.affairs_tasks to authenticated;
create policy owner_read on public.affairs_tasks for select to authenticated using((select auth.uid())=user_id);
create table public.affairs_progress_entries (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(user_id,id),
 project_id uuid, task_id uuid, foreign key(user_id,project_id) references public.affairs_projects(user_id,id), foreign key(user_id,task_id) references public.affairs_tasks(user_id,id),
 kind text not null check(kind in('manual','task_completion')),
 content text not null check(content is null or (char_length(btrim(content)) between 1 and 4000 and content=btrim(content))), next_step text check(next_step is null or (char_length(btrim(next_step)) between 1 and 2000 and next_step=btrim(next_step))), occurred_at timestamptz not null,
 completion_cycle bigint, voided_at timestamptz, voided_reason text check(voided_reason is null or (char_length(btrim(voided_reason)) between 1 and 2000 and voided_reason=btrim(voided_reason))),
 check(project_id is not null or task_id is not null),
 check((kind='task_completion')=(completion_cycle is not null)),
 check(kind<>'task_completion' or (task_id is not null and completion_cycle>0)),
 check((voided_at is null)=(voided_reason is null)));

alter table public.affairs_progress_entries enable row level security;
revoke all on table public.affairs_progress_entries from public,anon,authenticated;
grant select on table public.affairs_progress_entries to authenticated;
create policy owner_read on public.affairs_progress_entries for select to authenticated using((select auth.uid())=user_id);
create table public.affairs_wallets (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(user_id,id),
 unique(user_id), last_sequence bigint not null default 0 check(last_sequence>=0));

alter table public.affairs_wallets enable row level security;
revoke all on table public.affairs_wallets from public,anon,authenticated;
grant select on table public.affairs_wallets to authenticated;
create policy owner_read on public.affairs_wallets for select to authenticated using((select auth.uid())=user_id);
create table public.affairs_commands (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(user_id,id),
 request_id uuid not null, operation text not null, payload jsonb not null,
 result jsonb not null, applied_at timestamptz not null default now(), unique(user_id,request_id));

alter table public.affairs_commands enable row level security;
revoke all on table public.affairs_commands from public,anon,authenticated;
grant select on table public.affairs_commands to authenticated;
create policy owner_read on public.affairs_commands for select to authenticated using((select auth.uid())=user_id);

alter table public.affairs_mainlines add foreign key(user_id,focus_project_id) references public.affairs_projects(user_id,id);
create index affairs_projects_mainline on public.affairs_projects(user_id,mainline_id);
create index affairs_tasks_project on public.affairs_tasks(user_id,project_id);
create index affairs_milestones_project on public.affairs_milestones(user_id,project_id,sort_order);
create index affairs_mainlines_focus on public.affairs_mainlines(user_id,focus_project_id);
create index affairs_progress_project on public.affairs_progress_entries(user_id,project_id,occurred_at desc);
create index affairs_progress_task on public.affairs_progress_entries(user_id,task_id,occurred_at desc);
create unique index affairs_progress_cycle on public.affairs_progress_entries(user_id,task_id,completion_cycle) where kind='task_completion';
create unique index affairs_progress_active_completion on public.affairs_progress_entries(user_id,task_id) where kind='task_completion' and voided_at is null;

create function affairs_private.require_user() returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.role() is distinct from 'authenticated' then raise exception 'authentication_required'; end if;
 return auth.uid();
end $$;
create function affairs_private.lock_wallet() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=affairs_private.require_user();
begin
 insert into public.affairs_wallets(user_id) values(u) on conflict(user_id) do nothing;
 perform 1 from public.affairs_wallets where user_id=u for update;
 return u;
end $$;
create function affairs_private.coin_balance() returns bigint language sql stable security definer set search_path='' as $$ select 0::bigint $$;
revoke all on all functions in schema affairs_private from public,anon,authenticated;
-- AFFAIRS_PUBLIC_RPCS_START
create function affairs_private.clean_text(v text, max_length int, required boolean default false) returns text language plpgsql immutable set search_path='' as $$
declare t text:=nullif(btrim(v),'');
begin
 if (required and t is null) or char_length(t)>max_length then raise exception 'invalid_payload'; end if;
 return t;
end $$;
create function affairs_private.check_keys(p jsonb, allowed text[]) returns void language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) k where not(k=any(allowed))) then raise exception 'invalid_payload'; end if;
end $$;
create function affairs_private.metadata(kind text, p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare r jsonb; k text;
begin
 if kind='mainline' then
 perform affairs_private.check_keys(p,array['name','description','sort_order']);
 if p ? 'sort_order' and (jsonb_typeof(p->'sort_order')<>'number' or (p->>'sort_order')::numeric<>trunc((p->>'sort_order')::numeric)) then raise exception 'invalid_payload'; end if;
 r:=jsonb_build_object('name',affairs_private.clean_text(p->>'name',200,true),'description',affairs_private.clean_text(p->>'description',10000),'sort_order',coalesce((p->>'sort_order')::int,0));
 if (r->>'sort_order')::int<0 then raise exception 'invalid_payload'; end if;
 elsif kind='project' then
 perform affairs_private.check_keys(p,array['name','outcome','description','mainline_id','due_date']);
 r:=jsonb_build_object('name',affairs_private.clean_text(p->>'name',200,true),'outcome',affairs_private.clean_text(p->>'outcome',2000,true),'description',affairs_private.clean_text(p->>'description',10000),'mainline_id',(p->>'mainline_id')::uuid,'due_date',(p->>'due_date')::date);
 elsif kind='task' then
 perform affairs_private.check_keys(p,array['title','description','project_id','is_core','core_reason','completion_criteria','due_date']);
 if p ? 'is_core' and jsonb_typeof(p->'is_core')<>'boolean' then raise exception 'invalid_payload'; end if;
 r:=jsonb_build_object('title',affairs_private.clean_text(p->>'title',200,true),'description',affairs_private.clean_text(p->>'description',10000),'project_id',(p->>'project_id')::uuid,'is_core',coalesce((p->>'is_core')::boolean,false),'core_reason',affairs_private.clean_text(p->>'core_reason',2000),'completion_criteria',affairs_private.clean_text(p->>'completion_criteria',2000),'due_date',(p->>'due_date')::date);
 if (r->>'is_core')::boolean and (r->>'core_reason' is null or r->>'completion_criteria' is null) then raise exception 'invalid_payload'; end if;
 else raise exception 'invalid_payload';
 end if;
 -- Text fields cannot be silently stringified from numbers/objects.
 foreach k in array array['name','title','description','outcome','core_reason','completion_criteria','mainline_id','project_id','due_date'] loop
 if p ? k and jsonb_typeof(p->k) not in('string','null') then raise exception 'invalid_payload'; end if;
 end loop;
 return r;
exception when invalid_text_representation or datetime_field_overflow then raise exception 'invalid_payload';
end $$;
create function affairs_private.replay(request uuid, op text, args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.affairs_commands; u uuid:=affairs_private.require_user();
begin
 if request is null then raise exception 'invalid_request_id'; end if;
 select * into c from public.affairs_commands where user_id=u and request_id=request;
 if found then
 if c.operation<>op or c.payload is distinct from args then raise exception 'request_payload_conflict'; end if;
 return c.result || jsonb_build_object('replayed',true);
 end if;
 return null;
end $$;
create function affairs_private.receipt(request uuid,op text,args jsonb,obj uuid,rev bigint,delta int default 0,cmd uuid default gen_random_uuid()) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=affairs_private.require_user(); r jsonb;
begin
 r:=jsonb_build_object('object_id',obj,'object_revision',rev,'command_id',cmd,'coin_delta',delta,'balance_coins',affairs_private.coin_balance(),'replayed',false);
 insert into public.affairs_commands(id,user_id,request_id,operation,payload,result) values(cmd,u,request,op,args,r);
 return r;
end $$;
create function affairs_private.assert_reference(kind text,obj uuid,editable boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=affairs_private.require_user(); st text;
begin
 if obj is null then return; end if;
 if kind='mainline' then select status into st from public.affairs_mainlines where user_id=u and id=obj;
 elsif kind='project' then select status into st from public.affairs_projects where user_id=u and id=obj;
 elsif kind='task' then select status into st from public.affairs_tasks where user_id=u and id=obj;
 else raise exception 'invalid_payload'; end if;
 if not found then raise exception 'not_found'; end if;
 if editable and kind='project' and st in('completed','archived') then raise exception 'invalid_state_transition'; end if;
end $$;
create function affairs_private.foundation(op text,request uuid,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=affairs_private.lock_wallet(); a jsonb:=args; data jsonb; result jsonb; obj uuid; rev bigint; expected bigint;
 ml public.affairs_mainlines; pr public.affairs_projects; ta public.affairs_tasks; mi public.affairs_milestones;
 kind text; status_value text; item jsonb; ids uuid[]:=array[]::uuid[]; id_value uuid; project_value uuid; task_value uuid;
begin
 if op like 'create_affairs_%' or op like 'update_affairs_%' then
 kind:=replace(replace(op,'create_affairs_',''),'update_affairs_','');
 data:=affairs_private.metadata(kind,a->'payload'); a:=jsonb_set(a,'{payload}',data);
 elsif op='record_affairs_progress' then
 a:=a||jsonb_build_object('content',affairs_private.clean_text(a->>'content',4000,true),'next_step',affairs_private.clean_text(a->>'next_step',2000));
 elsif op='set_affairs_task_status' then
 a:=a||jsonb_build_object('waiting_reason',affairs_private.clean_text(a->>'waiting_reason',2000));
 elsif op='save_affairs_milestones' then
 if jsonb_typeof(a->'milestones') is distinct from 'array' then raise exception 'invalid_payload'; end if;
 data:='[]'::jsonb;
 for item in select value from jsonb_array_elements(a->'milestones') loop
 perform affairs_private.check_keys(item,array['id','expected_revision','title','completion_criteria','sort_order']);
 if jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'completion_criteria') is distinct from 'string'
 or (item ? 'sort_order' and jsonb_typeof(item->'sort_order')<>'number') then raise exception 'invalid_payload'; end if;
 if coalesce((item->>'sort_order')::numeric,0)<>trunc(coalesce((item->>'sort_order')::numeric,0)) then raise exception 'invalid_payload'; end if;
 data:=data||jsonb_build_array(jsonb_build_object('id',(item->>'id')::uuid,'expected_revision',(item->>'expected_revision')::bigint,
 'title',affairs_private.clean_text(item->>'title',200,true),'completion_criteria',affairs_private.clean_text(item->>'completion_criteria',2000,true),'sort_order',coalesce((item->>'sort_order')::int,0)));
 end loop;
 a:=jsonb_set(a,'{milestones}',data);
 end if;
 result:=affairs_private.replay(request,op,a); if result is not null then return result; end if;
 obj:=(a->>'id')::uuid; expected:=(a->>'expected_revision')::bigint;
 -- Wallet serializes all owner's commands; then project locks in id order, then target.
 perform 1 from public.affairs_projects where user_id=u order by id for update;
 if kind='mainline' or op like 'set_affairs_mainline_%' then
 if op='create_affairs_mainline' then
 insert into public.affairs_mainlines(user_id,name,description,sort_order) values(u,data->>'name',data->>'description',(data->>'sort_order')::int) returning id,revision into obj,rev;
 else
 select * into ml from public.affairs_mainlines where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if expected is distinct from ml.revision then raise exception 'stale_revision'; end if;
 if op='update_affairs_mainline' then update public.affairs_mainlines set name=data->>'name',description=data->>'description',sort_order=(data->>'sort_order')::int where id=obj;
 elsif op='set_affairs_mainline_status' then
 status_value:=a->>'status'; if status_value is null or status_value not in('active','paused','archived') then raise exception 'invalid_payload'; end if;
 update public.affairs_mainlines set status=status_value where id=obj;
 elsif op='set_affairs_mainline_focus' then
 project_value:=(a->>'project_id')::uuid; perform affairs_private.assert_reference('project',project_value);
 if project_value is not null and not exists(select 1 from public.affairs_projects where id=project_value and mainline_id=obj) then raise exception 'ownership_mismatch'; end if;
 update public.affairs_mainlines set focus_project_id=project_value where id=obj;
 else raise exception 'invalid_payload'; end if;
 update public.affairs_mainlines set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 end if;
 elsif kind='project' or op='set_affairs_project_status' then
 if kind='project' then perform affairs_private.assert_reference('mainline',(data->>'mainline_id')::uuid); end if;
 if op='create_affairs_project' then
 insert into public.affairs_projects(user_id,mainline_id,name,outcome,description,due_date) values(u,(data->>'mainline_id')::uuid,data->>'name',data->>'outcome',data->>'description',(data->>'due_date')::date) returning id,revision into obj,rev;
 else
 select * into pr from public.affairs_projects where user_id=u and id=obj;
 if not found then raise exception 'not_found'; end if;
 if expected is distinct from pr.revision then raise exception 'stale_revision'; end if;
 if op='update_affairs_project' then
 perform affairs_private.assert_reference('project',obj,true);
 update public.affairs_projects set mainline_id=(data->>'mainline_id')::uuid,name=data->>'name',outcome=data->>'outcome',description=data->>'description',due_date=(data->>'due_date')::date where id=obj;
 update public.affairs_mainlines set focus_project_id=null,revision=revision+1,updated_at=now() where user_id=u and focus_project_id=obj and id is distinct from (data->>'mainline_id')::uuid;
 else
 status_value:=a->>'status'; if status_value is null or status_value not in('active','paused','completed','archived') then raise exception 'invalid_payload'; end if;
 if pr.status in('completed','archived') and status_value='completed' then raise exception 'invalid_state_transition'; end if;
 if status_value='completed' and (coalesce((a->>'outcome_confirmed')::boolean,false)=false
 or exists(select 1 from public.affairs_milestones where user_id=u and project_id=obj and status<>'completed')
 or exists(select 1 from public.affairs_tasks where user_id=u and project_id=obj and is_core and status not in('done','cancelled'))) then raise exception 'project_requires_completion'; end if;
 update public.affairs_projects set status=status_value,completed_at=case when status_value='completed' then now() end where id=obj;
 end if;
 update public.affairs_projects set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 end if;
 elsif kind='task' or op='set_affairs_task_status' then
 if op='create_affairs_task' then
 perform affairs_private.assert_reference('project',(data->>'project_id')::uuid,true);
 insert into public.affairs_tasks(user_id,project_id,title,description,is_core,core_reason,completion_criteria,due_date) values(u,(data->>'project_id')::uuid,data->>'title',data->>'description',(data->>'is_core')::boolean,data->>'core_reason',data->>'completion_criteria',(data->>'due_date')::date) returning id,revision into obj,rev;
 else
 select * into ta from public.affairs_tasks where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if expected is distinct from ta.revision then raise exception 'stale_revision'; end if;
 perform affairs_private.assert_reference('project',ta.project_id,true);
 if ta.status='done' then raise exception 'invalid_state_transition'; end if;
 if op='update_affairs_task' then
 perform affairs_private.assert_reference('project',(data->>'project_id')::uuid,true);
 if ta.ever_completed and ta.is_core is distinct from (data->>'is_core')::boolean then raise exception 'core_eligibility_locked'; end if;
 update public.affairs_tasks set project_id=(data->>'project_id')::uuid,title=data->>'title',description=data->>'description',is_core=(data->>'is_core')::boolean,core_reason=data->>'core_reason',completion_criteria=data->>'completion_criteria',due_date=(data->>'due_date')::date where id=obj;
 else
 status_value:=a->>'status'; if status_value is null or status_value not in('todo','in_progress','waiting','cancelled') then raise exception 'invalid_payload'; end if;
 update public.affairs_tasks set status=status_value,waiting_reason=case when status_value='waiting' then a->>'waiting_reason' end where id=obj;
 end if;
 update public.affairs_tasks set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 end if;
 elsif op='save_affairs_milestones' then
 perform affairs_private.assert_reference('project',obj,true);
 select * into pr from public.affairs_projects where id=obj and user_id=u;
 if expected is distinct from pr.revision then raise exception 'stale_revision'; end if;
 for item in select value from jsonb_array_elements(a->'milestones') loop
 id_value:=(item->>'id')::uuid;
 if (item->>'sort_order')::int<0 then raise exception 'invalid_payload'; end if;
 if id_value is null then
 if item->>'expected_revision' is not null then raise exception 'invalid_payload'; end if;
 insert into public.affairs_milestones(user_id,project_id,title,completion_criteria,sort_order) values(u,obj,item->>'title',item->>'completion_criteria',(item->>'sort_order')::int) returning id into id_value;
 else
 if id_value=any(ids) then raise exception 'invalid_payload'; end if;
 select * into mi from public.affairs_milestones where id=id_value and user_id=u and project_id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if (item->>'expected_revision')::bigint is distinct from mi.revision then raise exception 'stale_revision'; end if;
 update public.affairs_milestones set title=item->>'title',completion_criteria=item->>'completion_criteria',sort_order=(item->>'sort_order')::int,revision=revision+1,updated_at=now() where id=id_value;
 end if;
 ids:=array_append(ids,id_value);
 end loop;
 if exists(select 1 from public.affairs_milestones where user_id=u and project_id=obj and not(id=any(ids)) and status='completed') then raise exception 'invalid_state_transition'; end if;
 delete from public.affairs_milestones where user_id=u and project_id=obj and not(id=any(ids));
 update public.affairs_projects set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 elsif op='set_affairs_milestone_completed' then
 select * into mi from public.affairs_milestones where id=obj and user_id=u for update;
 if not found then raise exception 'not_found'; end if;
 perform affairs_private.assert_reference('project',mi.project_id,true);
 if expected is distinct from mi.revision then raise exception 'stale_revision'; end if;
 if a->>'completed' is null then raise exception 'invalid_payload'; end if;
 update public.affairs_milestones set status=case when (a->>'completed')::boolean then 'completed' else 'pending' end,completed_at=case when (a->>'completed')::boolean then now() end,revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 update public.affairs_projects set revision=revision+1,updated_at=now() where id=mi.project_id;
 elsif op='record_affairs_progress' then
 project_value:=(a->>'project_id')::uuid; task_value:=(a->>'task_id')::uuid;
 if project_value is null and task_value is null then raise exception 'invalid_payload'; end if;
 if (a->>'occurred_at')::timestamptz is null or (a->>'occurred_at')::timestamptz>now() then raise exception 'invalid_payload'; end if;
 if task_value is not null then
 select * into ta from public.affairs_tasks where id=task_value and user_id=u for update;
 if not found then raise exception 'not_found'; end if;
 if project_value is not null and project_value is distinct from ta.project_id then raise exception 'ownership_mismatch'; end if;
 project_value:=ta.project_id;
 end if;
 perform affairs_private.assert_reference('project',project_value,true);
 insert into public.affairs_progress_entries(user_id,project_id,task_id,kind,content,next_step,occurred_at) values(u,project_value,task_value,'manual',a->>'content',a->>'next_step',(a->>'occurred_at')::timestamptz) returning id into obj;
 rev:=null;
 else raise exception 'invalid_payload';
 end if;
 return affairs_private.receipt(request,op,a,obj,rev);
end $$;
create function public.create_affairs_mainline(p_request_id uuid,p_payload jsonb) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('create_affairs_mainline',p_request_id,jsonb_build_object('payload',p_payload))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.create_affairs_mainline(uuid,jsonb) from public,anon;
grant execute on function public.create_affairs_mainline(uuid,jsonb) to authenticated;
create function public.create_affairs_project(p_request_id uuid,p_payload jsonb) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('create_affairs_project',p_request_id,jsonb_build_object('payload',p_payload))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.create_affairs_project(uuid,jsonb) from public,anon;
grant execute on function public.create_affairs_project(uuid,jsonb) to authenticated;
create function public.create_affairs_task(p_request_id uuid,p_payload jsonb) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('create_affairs_task',p_request_id,jsonb_build_object('payload',p_payload))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.create_affairs_task(uuid,jsonb) from public,anon;
grant execute on function public.create_affairs_task(uuid,jsonb) to authenticated;
create function public.update_affairs_mainline(p_request_id uuid,p_mainline_id uuid,p_expected_revision bigint,p_payload jsonb) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('update_affairs_mainline',p_request_id,jsonb_build_object('id',p_mainline_id,'expected_revision',p_expected_revision,'payload',p_payload))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.update_affairs_mainline(uuid,uuid,bigint,jsonb) from public,anon;
grant execute on function public.update_affairs_mainline(uuid,uuid,bigint,jsonb) to authenticated;
create function public.update_affairs_project(p_request_id uuid,p_project_id uuid,p_expected_revision bigint,p_payload jsonb) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('update_affairs_project',p_request_id,jsonb_build_object('id',p_project_id,'expected_revision',p_expected_revision,'payload',p_payload))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.update_affairs_project(uuid,uuid,bigint,jsonb) from public,anon;
grant execute on function public.update_affairs_project(uuid,uuid,bigint,jsonb) to authenticated;
create function public.update_affairs_task(p_request_id uuid,p_task_id uuid,p_expected_revision bigint,p_payload jsonb) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('update_affairs_task',p_request_id,jsonb_build_object('id',p_task_id,'expected_revision',p_expected_revision,'payload',p_payload))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.update_affairs_task(uuid,uuid,bigint,jsonb) from public,anon;
grant execute on function public.update_affairs_task(uuid,uuid,bigint,jsonb) to authenticated;
create function public.set_affairs_mainline_status(p_request_id uuid,p_mainline_id uuid,p_expected_revision bigint,p_status text) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('set_affairs_mainline_status',p_request_id,jsonb_build_object('id',p_mainline_id,'expected_revision',p_expected_revision,'status',p_status))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.set_affairs_mainline_status(uuid,uuid,bigint,text) from public,anon;
grant execute on function public.set_affairs_mainline_status(uuid,uuid,bigint,text) to authenticated;
create function public.set_affairs_project_status(p_request_id uuid,p_project_id uuid,p_expected_revision bigint,p_status text,p_outcome_confirmed boolean) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('set_affairs_project_status',p_request_id,jsonb_build_object('id',p_project_id,'expected_revision',p_expected_revision,'status',p_status,'outcome_confirmed',p_outcome_confirmed))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.set_affairs_project_status(uuid,uuid,bigint,text,boolean) from public,anon;
grant execute on function public.set_affairs_project_status(uuid,uuid,bigint,text,boolean) to authenticated;
create function public.set_affairs_task_status(p_request_id uuid,p_task_id uuid,p_expected_revision bigint,p_status text,p_waiting_reason text) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('set_affairs_task_status',p_request_id,jsonb_build_object('id',p_task_id,'expected_revision',p_expected_revision,'status',p_status,'waiting_reason',p_waiting_reason))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.set_affairs_task_status(uuid,uuid,bigint,text,text) from public,anon;
grant execute on function public.set_affairs_task_status(uuid,uuid,bigint,text,text) to authenticated;
create function public.set_affairs_mainline_focus(p_request_id uuid,p_mainline_id uuid,p_expected_revision bigint,p_project_id uuid) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('set_affairs_mainline_focus',p_request_id,jsonb_build_object('id',p_mainline_id,'expected_revision',p_expected_revision,'project_id',p_project_id))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.set_affairs_mainline_focus(uuid,uuid,bigint,uuid) from public,anon;
grant execute on function public.set_affairs_mainline_focus(uuid,uuid,bigint,uuid) to authenticated;
create function public.save_affairs_milestones(p_request_id uuid,p_project_id uuid,p_expected_revision bigint,p_milestones jsonb) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('save_affairs_milestones',p_request_id,jsonb_build_object('id',p_project_id,'expected_revision',p_expected_revision,'milestones',p_milestones))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.save_affairs_milestones(uuid,uuid,bigint,jsonb) from public,anon;
grant execute on function public.save_affairs_milestones(uuid,uuid,bigint,jsonb) to authenticated;
create function public.set_affairs_milestone_completed(p_request_id uuid,p_milestone_id uuid,p_expected_revision bigint,p_completed boolean) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('set_affairs_milestone_completed',p_request_id,jsonb_build_object('id',p_milestone_id,'expected_revision',p_expected_revision,'completed',p_completed))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.set_affairs_milestone_completed(uuid,uuid,bigint,boolean) from public,anon;
grant execute on function public.set_affairs_milestone_completed(uuid,uuid,bigint,boolean) to authenticated;
create function public.record_affairs_progress(p_request_id uuid,p_project_id uuid,p_task_id uuid,p_content text,p_next_step text,p_occurred_at timestamptz) returns table(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean) language sql security definer set search_path='' as $$
 select r.* from jsonb_to_record(affairs_private.foundation('record_affairs_progress',p_request_id,jsonb_build_object('project_id',p_project_id,'task_id',p_task_id,'content',p_content,'next_step',p_next_step,'occurred_at',p_occurred_at))) as r(object_id uuid,object_revision bigint,command_id uuid,coin_delta integer,balance_coins bigint,replayed boolean);
$$;
revoke all on function public.record_affairs_progress(uuid,uuid,uuid,text,text,timestamptz) from public,anon;
grant execute on function public.record_affairs_progress(uuid,uuid,uuid,text,text,timestamptz) to authenticated;
create view public.vw_affairs_project_progress with(security_invoker=true) as
select p.*, count(m.id)::int milestone_total,count(m.id) filter(where m.status='completed')::int milestone_completed,
 (count(m.id) filter(where m.status='completed'))::numeric/nullif(count(m.id),0) progress_rate
from public.affairs_projects p left join public.affairs_milestones m on m.user_id=p.user_id and m.project_id=p.id group by p.id;
create view public.vw_affairs_daily_contributions with(security_invoker=true) as
select user_id,(occurred_at at time zone 'Asia/Shanghai')::date business_date,count(*)::int contribution_count
from public.affairs_progress_entries where voided_at is null group by user_id,(occurred_at at time zone 'Asia/Shanghai')::date;
revoke all on public.vw_affairs_project_progress,public.vw_affairs_daily_contributions from public,anon;
grant select on public.vw_affairs_project_progress,public.vw_affairs_daily_contributions to authenticated;
revoke all on all functions in schema affairs_private from public,anon,authenticated;
commit;

