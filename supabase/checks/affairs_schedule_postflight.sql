-- Read-only. Copy the single report cell; no sample inserts or RPC writes.
select jsonb_build_object(
 'columns',(select jsonb_agg(to_jsonb(r) order by r.table_name,r.ordinal_position) from (
  select table_name,column_name,data_type,is_nullable,ordinal_position from information_schema.columns
  where table_schema='public' and table_name in('affairs_projects','affairs_tasks','vw_affairs_project_progress')
   and column_name in('planned_start_date','planned_time')
 ) r),
 'constraints',(select jsonb_agg(to_jsonb(r) order by r.relation,r.conname) from (
  select conrelid::regclass::text relation,conname,pg_get_constraintdef(oid) definition from pg_constraint
  where conrelid in('public.affairs_projects'::regclass,'public.affairs_tasks'::regclass)
   and conname in('affairs_projects_schedule','affairs_tasks_schedule')
 ) r),
 'relations',(select jsonb_agg(to_jsonb(r) order by r.relname) from (
  select relname,relrowsecurity,reloptions,relacl::text grants from pg_class
  where oid in('public.affairs_projects'::regclass,'public.affairs_tasks'::regclass,'public.vw_affairs_project_progress'::regclass)
 ) r),
 'functions',(select jsonb_agg(to_jsonb(r) order by r.signature) from (
  select oid::regprocedure::text signature,prosecdef security_definer,proconfig settings,proacl::text grants
  from pg_proc where oid in(to_regprocedure('affairs_private.metadata(text,jsonb)'),
   to_regprocedure('affairs_private.foundation(text,uuid,jsonb)'),to_regprocedure('affairs_private.resolve_inbox(uuid,jsonb)'))
 ) r),
 'invalid_rows',(select jsonb_agg(to_jsonb(r) order by r.resource) from (
  select 'projects' resource,count(*) invalid_rows from public.affairs_projects where
   (planned_start_date>due_date) or (planned_time is not null and (due_date is null or extract(second from planned_time)<>0 or planned_time>=time '24:00'))
  union all select 'tasks',count(*) from public.affairs_tasks where
   (planned_start_date>due_date) or (planned_time is not null and (due_date is null or extract(second from planned_time)<>0 or planned_time>=time '24:00'))
 ) r)
) report;
