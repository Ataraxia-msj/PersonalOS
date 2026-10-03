-- Read-only: run before either Affairs migration. Unexpected names require review.
select current_setting('server_version_num')::integer as version_num, version();
select n.nspname,c.relname,c.relkind,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and (c.relname like 'affairs_%' or c.relname like 'vw_affairs_%');
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='affairs_private' or (n.nspname='public' and p.proname like '%affairs%');
select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' order by table_name,grantee,privilege_type;
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname;
select viewname,definition from pg_views where schemaname='public' order by viewname;
