-- Read-only. Run once and copy the single report cell before applying migration.
select jsonb_build_object(
 'columns',(select jsonb_agg(to_jsonb(r) order by r.table_name,r.ordinal_position) from (
  select table_name,column_name,data_type,is_nullable,ordinal_position
  from information_schema.columns where table_schema='public'
   and table_name in('affairs_projects','affairs_tasks','vw_affairs_project_progress')
 ) r),
 'functions',(select jsonb_agg(to_jsonb(r) order by r.signature) from (
  select oid::regprocedure::text signature,pg_get_functiondef(oid) definition,
   proacl::text grants,proconfig settings,prosecdef security_definer
  from pg_proc where oid in(to_regprocedure('affairs_private.metadata(text,jsonb)'),
   to_regprocedure('affairs_private.foundation(text,uuid,jsonb)'),to_regprocedure('affairs_private.resolve_inbox(uuid,jsonb)'))
 ) r),
 'view_definition',pg_get_viewdef('public.vw_affairs_project_progress'::regclass,true),
 'relations',(select jsonb_agg(to_jsonb(r) order by r.relname) from (
  select relname,relrowsecurity,reloptions,relacl::text grants from pg_class
  where oid in('public.affairs_projects'::regclass,'public.affairs_tasks'::regclass,'public.vw_affairs_project_progress'::regclass)
 ) r),
 'constraints',(select jsonb_agg(to_jsonb(r) order by r.relation,r.conname) from (
  select conrelid::regclass::text relation,conname,pg_get_constraintdef(oid) definition
  from pg_constraint where conrelid in('public.affairs_projects'::regclass,'public.affairs_tasks'::regclass)
 ) r),
 'policies',(select jsonb_agg(to_jsonb(r) order by r.tablename,r.policyname) from (
  select tablename,policyname,roles,cmd,qual,with_check from pg_policies
  where schemaname='public' and tablename in('affairs_projects','affairs_tasks')
 ) r),
 'grants',(select jsonb_agg(to_jsonb(r) order by r.table_name,r.grantee,r.privilege_type) from (
  select table_name,grantee,privilege_type from information_schema.role_table_grants
  where table_schema='public' and table_name in('affairs_projects','affairs_tasks','vw_affairs_project_progress')
 ) r)
) report;
