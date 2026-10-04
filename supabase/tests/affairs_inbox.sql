-- Isolated runner only. Security contract must be asserted against catalog, not SQL text.
do $$ declare f record; begin
 if not (select relrowsecurity from pg_class where oid='public.affairs_inbox_entries'::regclass) then raise exception 'RLS disabled'; end if;
 if has_table_privilege('authenticated','public.affairs_inbox_entries','INSERT,UPDATE,DELETE') then raise exception 'direct DML granted'; end if;
 if not has_table_privilege('authenticated','public.affairs_inbox_entries','SELECT') then raise exception 'read missing'; end if;
 if has_table_privilege('anon','public.affairs_inbox_entries','SELECT') then raise exception 'anon read granted'; end if;
 for f in select p.oid,p.proname,p.prosecdef,p.proconfig from pg_proc p where pronamespace='public'::regnamespace and proname like '%affairs_inbox_entry' loop
  if not f.prosecdef or not ('search_path=""'=any(f.proconfig)) then raise exception 'unsafe function %',f.proname; end if;
  if has_function_privilege('anon',f.oid,'EXECUTE') or not has_function_privilege('authenticated',f.oid,'EXECUTE') then raise exception 'incorrect execute %',f.proname; end if;
 end loop;
end $$;
