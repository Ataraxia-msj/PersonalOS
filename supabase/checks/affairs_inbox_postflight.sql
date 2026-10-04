-- Read-only, user-run deployment inspection. No inserts or schema changes.
select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='affairs_inbox_entries' order by ordinal_position;
select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid=to_regclass('public.affairs_inbox_entries');
select policyname,roles,cmd,qual from pg_policies where schemaname='public' and tablename='affairs_inbox_entries';
select p.oid::regprocedure signature,pg_get_function_result(p.oid) result,p.prosecdef,p.proconfig,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute
from pg_proc p where pronamespace='public'::regnamespace and proname like '%affairs_inbox_entry' order by proname;
select grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='affairs_inbox_entries' order by grantee,privilege_type;
