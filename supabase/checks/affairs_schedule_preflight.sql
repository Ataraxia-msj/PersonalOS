-- Read-only: share results before applying the schedule migration.
select table_name,column_name,data_type,is_nullable,ordinal_position
from information_schema.columns where table_schema='public' and table_name in('affairs_projects','affairs_tasks','vw_affairs_project_progress') order by table_name,ordinal_position;
select oid::regprocedure::text signature,pg_get_functiondef(oid) definition,proacl,proconfig,prosecdef
from pg_proc where oid in(to_regprocedure('affairs_private.metadata(text,jsonb)'),to_regprocedure('affairs_private.foundation(text,uuid,jsonb)'),to_regprocedure('affairs_private.resolve_inbox(uuid,jsonb)'));
select pg_get_viewdef('public.vw_affairs_project_progress'::regclass,true) definition;
select relname,relrowsecurity,reloptions,relacl from pg_class where oid in('public.affairs_projects'::regclass,'public.affairs_tasks'::regclass,'public.vw_affairs_project_progress'::regclass);
select conrelid::regclass::text relation,conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid in('public.affairs_projects'::regclass,'public.affairs_tasks'::regclass);
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where tablename in('affairs_projects','affairs_tasks');
select table_name,grantee,privilege_type from information_schema.role_table_grants where table_name in('affairs_projects','affairs_tasks','vw_affairs_project_progress') order by 1,2,3;
