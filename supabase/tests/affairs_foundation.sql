-- Behavior/constraints assertions, isolated runner only.
do $$
declare t text;
begin
  foreach t in array array['mainlines','projects','milestones','tasks','progress_entries','wallets','commands'] loop
    if not exists (select 1 from pg_class where oid=to_regclass('public.affairs_'||t) and relrowsecurity) then
      raise exception 'RLS missing on %', t;
    end if;
    if has_table_privilege('authenticated','public.affairs_'||t,'INSERT,UPDATE,DELETE') then
      raise exception 'direct write allowed on %', t;
    end if;
    if has_table_privilege('anon','public.affairs_'||t,'SELECT') then raise exception 'anon read allowed'; end if;
  end loop;
  if has_schema_privilege('authenticated','affairs_private','USAGE') then raise exception 'private exposed'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='affairs_private' and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE'))) then raise exception 'private function exposed'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%affairs%' and has_function_privilege('anon',p.oid,'EXECUTE')) then raise exception 'anon RPC exposed'; end if;
end $$;
