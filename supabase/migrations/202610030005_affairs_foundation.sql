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
commit;

