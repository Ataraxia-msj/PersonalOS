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
end $$;
