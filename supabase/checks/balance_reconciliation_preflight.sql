-- 余额校准：只读结构检查，不是 migration，也不是数据备份。
-- 在 Supabase SQL Editor 新建查询，完整粘贴本文件并运行。
-- 将返回的 preflight_report 单元格完整复制回来（也可保存成 txt）。
-- 只读系统目录；不读取余额/交易记录/Auth 数据，不调用业务 RPC。
-- 不创建快照、不更改表/权限/RLS。缺少对象时在报告中标记 exists=false。
-- READ ONLY reference: https://www.postgresql.org/docs/17/sql-set-transaction.html
begin transaction read only;
set local statement_timeout = '15s';

with targets(name) as (
  values ('accounts'), ('balance_snapshots'), ('journal_entries'), ('journal_lines'),
    ('budget_periods'), ('vw_account_balances'), ('vw_net_worth'),
    ('vw_monthly_financial_summary')
), relations as (
  select c.oid, c.relname, c.relkind, c.relowner, c.relrowsecurity,
    c.relforcerowsecurity, c.reloptions, c.relacl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in (select name from targets)
), relevant_functions as (
  select p.*
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where p.prokind = 'f' and (
    (n.nspname = 'public' and (
      p.proname in ('create_expense_transaction', 'update_expense_transaction',
        'save_monthly_budget', 'reconcile_account_balance', 'create_balance_snapshot')
      or p.proname like '%balance_snapshot%'
      or p.proname like '%reconcil%'
    ))
    or p.oid in (
      select t.tgfoid from pg_catalog.pg_trigger t
      join relations r on r.oid = t.tgrelid
      where not t.tgisinternal
    )
  )
), app_roles as (
  select oid, rolname from pg_catalog.pg_roles
  where rolname in ('anon', 'authenticated')
)
select jsonb_pretty(jsonb_build_object(
  'check_name', 'balance_reconciliation_preflight_v1',
  'checked_at', current_timestamp,
  'postgres_version', current_setting('server_version'),
  'database_session_timezone', current_setting('TimeZone'),
  'read_only', current_setting('transaction_read_only'),
  'relations', (select jsonb_agg(jsonb_build_object(
    'name', t.name, 'exists', r.oid is not null, 'kind', r.relkind,
    'owner', pg_catalog.pg_get_userbyid(r.relowner),
    'rls', r.relrowsecurity, 'force_rls', r.relforcerowsecurity,
    'options', r.reloptions, 'acl', r.relacl::text
  ) order by t.name) from targets t left join relations r on r.relname = t.name),
  'columns', (select jsonb_agg(jsonb_build_object(
    'table', r.relname, 'name', a.attname, 'position', a.attnum,
    'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
    'not_null', a.attnotnull, 'identity', a.attidentity,
    'generated', a.attgenerated, 'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
  ) order by r.relname, a.attnum)
    from relations r join pg_catalog.pg_attribute a on a.attrelid = r.oid
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attnum > 0 and not a.attisdropped),
  'enum_values', (select jsonb_agg(jsonb_build_object(
    'schema', n.nspname, 'type', t.typname, 'label', e.enumlabel, 'order', e.enumsortorder
  ) order by n.nspname, t.typname, e.enumsortorder)
    from pg_catalog.pg_type t join pg_catalog.pg_enum e on e.enumtypid = t.oid
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where t.oid in (
      select a.atttypid from pg_catalog.pg_attribute a join relations r on r.oid = a.attrelid
      where a.attnum > 0 and not a.attisdropped
    )),
  'constraints', (select jsonb_agg(jsonb_build_object(
    'table', r.relname, 'name', c.conname, 'validated', c.convalidated,
    'definition', pg_catalog.pg_get_constraintdef(c.oid)
  ) order by r.relname, c.conname)
    from relations r join pg_catalog.pg_constraint c on c.conrelid = r.oid),
  'indexes', (select jsonb_agg(jsonb_build_object(
    'table', r.relname, 'name', c.relname, 'unique', i.indisunique,
    'valid', i.indisvalid, 'definition', pg_catalog.pg_get_indexdef(i.indexrelid)
  ) order by r.relname, c.relname)
    from relations r join pg_catalog.pg_index i on i.indrelid = r.oid
    join pg_catalog.pg_class c on c.oid = i.indexrelid),
  'triggers', (select jsonb_agg(jsonb_build_object(
    'table', r.relname, 'name', t.tgname, 'enabled', t.tgenabled,
    'definition', pg_catalog.pg_get_triggerdef(t.oid),
    'function', t.tgfoid::regprocedure::text
  ) order by r.relname, t.tgname)
    from relations r join pg_catalog.pg_trigger t on t.tgrelid = r.oid
    where not t.tgisinternal),
  'functions', (select jsonb_agg(jsonb_build_object(
    'identity', p.oid::regprocedure::text,
    'arguments', pg_catalog.pg_get_function_arguments(p.oid),
    'result', pg_catalog.pg_get_function_result(p.oid),
    'security_definer', p.prosecdef, 'settings', p.proconfig,
    'acl', p.proacl::text, 'definition', pg_catalog.pg_get_functiondef(p.oid)
  ) order by p.proname, p.oid) from relevant_functions p),
  'views', (select jsonb_agg(jsonb_build_object(
    'name', r.relname, 'definition', pg_catalog.pg_get_viewdef(r.oid, true)
  ) order by r.relname) from relations r where r.relkind in ('v', 'm')),
  'policies', (select jsonb_agg(to_jsonb(p) order by p.tablename, p.policyname)
    from pg_catalog.pg_policies p
    where p.schemaname = 'public' and p.tablename in (select name from targets)),
  'app_table_grants', (select jsonb_agg(jsonb_build_object(
    'table', g.table_name, 'grantee', g.grantee, 'privilege', g.privilege_type
  ) order by g.table_name, g.grantee, g.privilege_type)
    from information_schema.table_privileges g
    where g.table_schema = 'public' and g.table_name in (select name from targets)
      and g.grantee in ('authenticated', 'anon', 'PUBLIC')),
  'app_column_grants', (select jsonb_agg(jsonb_build_object(
    'table', g.table_name, 'column', g.column_name,
    'grantee', g.grantee, 'privilege', g.privilege_type
  ) order by g.table_name, g.column_name, g.grantee, g.privilege_type)
    from information_schema.column_privileges g
    where g.table_schema = 'public' and g.table_name in (select name from targets)
      and g.grantee in ('authenticated', 'anon', 'PUBLIC')),
  'effective_table_privileges', (select jsonb_agg(jsonb_build_object(
    'table', r.relname, 'role', ar.rolname,
    'select', pg_catalog.has_table_privilege(ar.oid, r.oid, 'SELECT'),
    'insert', pg_catalog.has_table_privilege(ar.oid, r.oid, 'INSERT'),
    'update', pg_catalog.has_table_privilege(ar.oid, r.oid, 'UPDATE'),
    'delete', pg_catalog.has_table_privilege(ar.oid, r.oid, 'DELETE')
  ) order by r.relname, ar.rolname) from relations r cross join app_roles ar),
  'effective_function_privileges', (select jsonb_agg(jsonb_build_object(
    'function', p.oid::regprocedure::text, 'role', ar.rolname,
    'execute', pg_catalog.has_function_privilege(ar.oid, p.oid, 'EXECUTE')
  ) order by p.proname, p.oid, ar.rolname)
    from relevant_functions p cross join app_roles ar)
)) as preflight_report;

commit;
