-- READ-ONLY production preflight. This is NOT a migration or a backup.
-- Copy this whole file into a NEW Supabase SQL Editor query.
-- Reads only finance schema metadata: no transaction rows, Auth tokens or passwords.
-- Does not call the expense/budget RPCs and does not change grants or RLS.
begin transaction read only;
set local statement_timeout = '15s';

with targets(name) as (
  values ('accounts'), ('categories'), ('journal_entries'), ('journal_lines'),
    ('budget_buckets'), ('budget_periods'), ('budget_allocations'), ('budget_impacts'),
    ('vw_transaction_details'), ('vw_budget_execution'), ('vw_monthly_financial_summary')
), relations as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.reloptions
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in (select name from targets)
)
select jsonb_pretty(jsonb_build_object(
  'checked_at', current_timestamp,
  'postgres_version', current_setting('server_version'),
  'read_only', current_setting('transaction_read_only'),
  'relations', (select jsonb_agg(jsonb_build_object(
    'name', t.name, 'exists', r.oid is not null, 'kind', r.relkind,
    'rls', r.relrowsecurity, 'force_rls', r.relforcerowsecurity, 'options', r.reloptions
  ) order by t.name) from targets t left join relations r on r.relname = t.name),
  'columns', (select jsonb_agg(jsonb_build_object(
    'table', r.relname, 'name', a.attname, 'position', a.attnum,
    'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
    'not_null', a.attnotnull, 'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
  ) order by r.relname, a.attnum)
    from relations r join pg_catalog.pg_attribute a on a.attrelid = r.oid
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attnum > 0 and not a.attisdropped),
  'constraints', (select jsonb_agg(jsonb_build_object(
    'table', r.relname, 'name', c.conname,
    'definition', pg_catalog.pg_get_constraintdef(c.oid)
  ) order by r.relname, c.conname)
    from relations r join pg_catalog.pg_constraint c on c.conrelid = r.oid),
  'triggers', (select jsonb_agg(jsonb_build_object(
    'table', r.relname, 'name', t.tgname, 'enabled', t.tgenabled,
    'definition', pg_catalog.pg_get_triggerdef(t.oid),
    'function', t.tgfoid::regprocedure::text
  ) order by r.relname, t.tgname)
    from relations r join pg_catalog.pg_trigger t on t.tgrelid = r.oid
    where not t.tgisinternal),
  'finance_functions', (select jsonb_agg(jsonb_build_object(
    'name', p.proname, 'arguments', pg_catalog.pg_get_function_arguments(p.oid),
    'result', pg_catalog.pg_get_function_result(p.oid),
    'security_definer', p.prosecdef, 'settings', p.proconfig,
    'acl', p.proacl::text,
    'definition', pg_catalog.pg_get_functiondef(p.oid)
  ) order by p.proname, p.oid)
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
      'create_expense_transaction', 'update_expense_transaction', 'save_monthly_budget'
    )),
  'views', (select jsonb_agg(jsonb_build_object(
    'name', r.relname, 'definition', pg_catalog.pg_get_viewdef(r.oid, true)
  ) order by r.relname) from relations r where r.relkind = 'v'),
  'policies', (select jsonb_agg(to_jsonb(p) order by p.tablename, p.policyname)
    from pg_catalog.pg_policies p
    where p.schemaname = 'public' and p.tablename in (select name from targets)),
  'app_table_grants', (select jsonb_agg(jsonb_build_object(
    'table', g.table_name, 'grantee', g.grantee, 'privilege', g.privilege_type
  ) order by g.table_name, g.grantee, g.privilege_type)
    from information_schema.table_privileges g
    where g.table_schema = 'public' and g.table_name in (select name from targets)
      and g.grantee in ('authenticated', 'anon', 'PUBLIC'))
)) as preflight_report;

commit;
