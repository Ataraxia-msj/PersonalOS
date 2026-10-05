-- Isolated runner only: no production test writes.
do $$ declare t text; begin
 foreach t in array array['affairs_projects','affairs_tasks'] loop
  if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'RLS disabled'; end if;
  if has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE') then raise exception 'direct DML granted'; end if;
  if has_table_privilege('anon','public.'||t,'SELECT') then raise exception 'anon read granted'; end if;
 end loop;
 if not ((select reloptions from pg_class where oid='public.vw_affairs_project_progress'::regclass) @> array['security_invoker=true']) then raise exception 'View must use invoker'; end if;
end $$;
